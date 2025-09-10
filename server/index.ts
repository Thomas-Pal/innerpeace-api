import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { google, calendar_v3 } from 'googleapis';

const app = express();
app.use(cors());
app.use(express.json());

const {
  PORT = '8080',
  CALENDAR_ID = 'primary', // user-side calendar (created with the user's OAuth access token)
  USE_MEET = 'auto',       // 'auto' | 'always' | 'never'
  // Manager mirror (optional)
  MANAGER_CALENDAR_ID = '',
  GOOGLE_DELEGATED_USER = '',
  SERVICE_ACCOUNT_KEY = '',
} = process.env as Record<string, string>;

type Authed = { idJwt: string; access: string; userId?: string };

function requireAuth(req: express.Request): Authed {
  const idJwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const access = String(req.headers['x-oauth-access-token'] || '');
  const userId = String(req.headers['x-user-id'] || '') || undefined;

  if (!idJwt) {
    const err: any = new Error('Missing ID token');
    err.status = 401;
    throw err;
  }
  if (!access) {
    const err: any = new Error('Missing OAuth access token');
    err.status = 401;
    throw err;
  }
  return { idJwt, access, userId };
}

function calendarClient(accessToken: string) {
  const oAuth2 = new google.auth.OAuth2();
  oAuth2.setCredentials({ access_token: accessToken });
  google.options({ auth: oAuth2 });
  return google.calendar({ version: 'v3', auth: oAuth2 });
}

/**
 * Service-account calendar client (domain-wide delegation) for manager mirror.
 * Returns null if not configured.
 */
function managerCalendarClient() {
  try {
    if (!SERVICE_ACCOUNT_KEY || !GOOGLE_DELEGATED_USER || !MANAGER_CALENDAR_ID) return null;
    const creds = JSON.parse(SERVICE_ACCOUNT_KEY);
    const jwt = new google.auth.JWT(
      creds.client_email,
      undefined,
      creds.private_key,
      ['https://www.googleapis.com/auth/calendar'],
      GOOGLE_DELEGATED_USER
    );
    return google.calendar({ version: 'v3', auth: jwt });
  } catch (e) {
    console.warn('SERVICE_ACCOUNT_KEY invalid or not set; manager mirror disabled');
    return null;
  }
}

app.get('/healthz', (_req, res) => res.json({ ok: true }));

/**
 * GET /api/availability?start=ISO&end=ISO
 * Requires calendar.readonly OR calendar.events scope for the *user* calendar in CALENDAR_ID.
 */
app.get('/api/availability', async (req, res) => {
  try {
    const { access } = requireAuth(req);
    const cal = calendarClient(access);

    const timeMin = String(req.query.start || '');
    const timeMax = String(req.query.end || '');
    if (!timeMin || !timeMax) return res.status(400).json({ error: 'missing_dates' });

    const fb = await cal.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: CALENDAR_ID }],
      },
    });

    const busy = (fb.data.calendars?.[CALENDAR_ID as 'primary'] as any)?.busy ?? [];
    // UI expects {items:[{start,end}...]}
    const items = busy.map((b: any) => ({ start: b.start, end: b.end }));
    res.json({ items });
  } catch (e: any) {
    const details = e?.response?.data?.error?.message || e?.message || 'freebusy_failed';
    console.error('freebusy_failed', details);
    res.status(500).json({ error: 'freebusy_failed' });
  }
});

/**
 * GET /api/bookings?uid=googleSub
 * Lists upcoming events created by the app on the calendar in CALENDAR_ID, using the user's OAuth token.
 */
app.get('/api/bookings', async (req, res) => {
  try {
    const { access } = requireAuth(req);
    const cal = calendarClient(access);

    const now = new Date().toISOString();
    const events = await cal.events.list({
      calendarId: CALENDAR_ID,
      timeMin: now,
      singleEvents: true,
      orderBy: 'startTime',
      q: 'InnerPeace Session',
      maxResults: 50,
    });

    const items = (events.data.items || []).map((e) => ({
      id: e.id!,
      summary: e.summary,
      startsAt: e.start?.dateTime || e.start?.date || null,
      endsAt: e.end?.dateTime || e.end?.date || null,
      meetingUrl:
        e.hangoutLink ||
        e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ||
        null,
      location: e.location || null,
    }));

    res.json({ ok: true, items });
  } catch (e: any) {
    const details = e?.response?.data?.error?.message || e?.message || 'list_bookings_failed';
    console.error('list_bookings_failed', details);
    res.status(500).json({ ok: false, error: 'list_bookings_failed' });
  }
});

/**
 * POST /api/book
 * body: { start, end, email?, name?, mode: 'virtual'|'inperson', location? }
 * - Creates the event on the *user* calendar (with the user's OAuth token).
 * - If service-account is configured, mirrors the event to MANAGER_CALENDAR_ID
 *   and links both via extendedProperties.private so update/cancel also affect the mirror.
 */
app.post('/api/book', async (req, res) => {
  try {
    const { access } = requireAuth(req);
    const userCal = calendarClient(access);

    const { start, end, email, name, mode, location } = req.body || {};
    if (!start || !end) return res.status(400).json({ error: 'missing_dates' });

    const wantMeet =
      USE_MEET === 'always'
        ? true
        : USE_MEET === 'never'
        ? false
        : String(mode || '').toLowerCase() === 'virtual';

    // ---- Create on USER calendar (typed params to force correct overload) ----
    const userInsertParams: calendar_v3.Params$Resource$Events$Insert = {
      calendarId: CALENDAR_ID,
      // avoid duplicate email notifications when we also mirror to manager
      sendUpdates: 'none',
      conferenceDataVersion: wantMeet ? 1 : 0,
      requestBody: {
        summary: 'InnerPeace Session',
        description: name ? `Coaching session with ${name}` : 'Coaching session',
        start: { dateTime: start },
        end: { dateTime: end },
        // Attendees array must be flat objects; include the participant only (no manager — the mirror handles that)
        attendees: email ? [{ email, responseStatus: 'accepted' as const }] : undefined,
        location: !wantMeet ? (location || 'TBD') : undefined,
        conferenceData: wantMeet
          ? { createRequest: { requestId: `meet-${Date.now()}` } }
          : undefined,
        extendedProperties: {
          private: {
            // placeholder; will be patched with managerEventId if we create a mirror
          },
        },
      },
    };

    const { data: userEvent } = await userCal.events.insert(userInsertParams);

    const userMeetingUrl =
      userEvent.hangoutLink ||
      userEvent.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ||
      null;

    // ---- Optional: mirror to MANAGER calendar using service account ----
    let managerEventId: string | undefined;
    const mgrCal = managerCalendarClient();

    if (mgrCal && MANAGER_CALENDAR_ID) {
      try {
        const mgrInsertParams: calendar_v3.Params$Resource$Events$Insert = {
          calendarId: MANAGER_CALENDAR_ID,
          sendUpdates: 'all',
          conferenceDataVersion: wantMeet ? 1 : 0,
          requestBody: {
            summary: 'InnerPeace Session',
            description:
              (name ? `Coaching session with ${name}\n` : 'Coaching session\n') +
              (email ? `Client: ${email}\n` : ''),
            start: { dateTime: start },
            end: { dateTime: end },
            // no attendee to the client here to avoid double-invites;
            // the user already has the event on their own calendar
            attendees: undefined,
            location: !wantMeet ? (location || 'TBD') : undefined,
            conferenceData: wantMeet
              ? { createRequest: { requestId: `meet-mgr-${Date.now()}` } }
              : undefined,
            extendedProperties: {
              private: {
                mirrorOf: String(userEvent.id || ''), // link back to the user event
              },
            },
          },
        };

        const { data: mgrEvent } = await mgrCal.events.insert(mgrInsertParams);
        managerEventId = mgrEvent.id || undefined;

        // Patch user event with the manager event id so we can update/cancel later
        if (managerEventId) {
          const patchParams: calendar_v3.Params$Resource$Events$Patch = {
            calendarId: CALENDAR_ID,
            eventId: String(userEvent.id),
            requestBody: {
              extendedProperties: {
                private: {
                  ...(userEvent.extendedProperties?.private || {}),
                  managerEventId: String(managerEventId),
                },
              },
            },
          };
          await userCal.events.patch(patchParams);
        }
      } catch (mirrorErr: any) {
        console.warn('manager_mirror_failed', mirrorErr?.response?.data || mirrorErr?.message || mirrorErr);
        // continue without failing the booking
      }
    }

    res.json({
      ok: true,
      id: userEvent.id,
      meetingUrl: userMeetingUrl,
      managerEventId: managerEventId || null,
    });
  } catch (e: any) {
    const details = e?.response?.data?.error?.message || e?.message || 'booking_failed';
    console.error('booking_failed', details);
    res.status(500).json({ error: 'booking_failed', details });
  }
});

/**
 * DELETE /api/book/:id
 * Cancels on the user calendar; if linked, also cancels the mirror on the manager calendar.
 */
app.delete('/api/book/:id', async (req, res) => {
  try {
    const { access } = requireAuth(req);
    const userCal = calendarClient(access);
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ error: 'missing_id' });

    // Read first so we can see if a manager mirror exists
    const { data: ev } = await userCal.events.get({ calendarId: CALENDAR_ID, eventId: id });
    const managerEventId = ev.extendedProperties?.private?.managerEventId;

    await userCal.events.delete({ calendarId: CALENDAR_ID, eventId: id });

    // Delete mirror if we can
    const mgrCal = managerCalendarClient();
    if (mgrCal && MANAGER_CALENDAR_ID && managerEventId) {
      try {
        await mgrCal.events.delete({ calendarId: MANAGER_CALENDAR_ID, eventId: managerEventId });
      } catch (mirrorErr: any) {
        console.warn('manager_cancel_failed', mirrorErr?.response?.data || mirrorErr?.message || mirrorErr);
      }
    }

    res.json({ ok: true });
  } catch (e: any) {
    console.error('cancel_failed:', e?.response?.data || e?.message || e);
    res.status(500).json({ ok: false, error: 'cancel_failed' });
  }
});

/**
 * PUT /api/book/:id  (move/amend)
 * body: { start, end, location? }
 * Updates the user event; if linked, also updates the manager mirror.
 */
app.put('/api/book/:id', async (req, res) => {
  try {
    const { access } = requireAuth(req);
    const userCal = calendarClient(access);
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ error: 'missing_id' });

    const { start, end, location } = req.body || {};
    if (!start || !end) return res.status(400).json({ error: 'missing_dates' });

    // Read to discover mirror id
    const { data: existing } = await userCal.events.get({ calendarId: CALENDAR_ID, eventId: id });
    const managerEventId = existing.extendedProperties?.private?.managerEventId;

    // Update user event (typed)
    const userPatchParams: calendar_v3.Params$Resource$Events$Patch = {
      calendarId: CALENDAR_ID,
      eventId: id,
      requestBody: {
        start: { dateTime: start },
        end: { dateTime: end },
        location: location ?? undefined,
      },
    };
    const { data: updatedUser } = await userCal.events.patch(userPatchParams);

    // Update mirror if present
    const mgrCal = managerCalendarClient();
    if (mgrCal && MANAGER_CALENDAR_ID && managerEventId) {
      try {
        const mgrPatchParams: calendar_v3.Params$Resource$Events$Patch = {
          calendarId: MANAGER_CALENDAR_ID,
          eventId: managerEventId,
          requestBody: {
            start: { dateTime: start },
            end: { dateTime: end },
            location: location ?? undefined,
          },
        };
        await mgrCal.events.patch(mgrPatchParams);
      } catch (mirrorErr: any) {
        console.warn('manager_amend_failed', mirrorErr?.response?.data || mirrorErr?.message || mirrorErr);
      }
    }

    res.json({
      ok: true,
      eventId: updatedUser.id,
      start: updatedUser.start?.dateTime || updatedUser.start?.date,
      end: updatedUser.end?.dateTime || updatedUser.end?.date,
      location: updatedUser.location || null,
    });
  } catch (e: any) {
    console.error('amend_failed:', e?.response?.data || e?.message || e);
    res.status(500).json({ ok: false, error: 'amend_failed' });
  }
});

const port = Number(PORT) || 8080;
app.listen(port, '0.0.0.0', () => console.log(`API listening on :${port}`));
