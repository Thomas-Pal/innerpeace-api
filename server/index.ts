import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { google, calendar_v3 } from 'googleapis';

const app = express();
app.use(cors());
app.use(express.json());

/**
 * ENV you can set:
 * - PORT                       (default 8080)
 * - CALENDAR_ID                calendar to read/write (default 'primary')
 * - MANAGER_CALENDAR_ID        if set, we read availability + create events here
 * - MANAGER_EMAIL              the manager’s email to always invite
 * - USE_MEET                   'auto' | 'always' | 'never'  (default 'auto')
 * - SEND_UPDATES               'all' | 'externalOnly' | 'none'  (default 'all')
 */
const {
  PORT = '8080',
  CALENDAR_ID = 'primary',
  MANAGER_CALENDAR_ID = '',
  MANAGER_EMAIL = 'thomaspal@innerpeace-developer.co.uk',
  USE_MEET = 'auto', // 'auto' | 'always' | 'never'
  SEND_UPDATES = 'all',
} = process.env as Record<string, string>;

// Where we read availability from and where we create/list bookings
const TARGET_CAL_ID = MANAGER_CALENDAR_ID || CALENDAR_ID;

type Authed = { idJwt: string; access: string; userId?: string };

/** Require both the ID token and the OAuth access token (what your Gateway expects). */
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
  return google.calendar({ version: 'v3', auth: oAuth2 });
}

app.get('/healthz', (_req, res) => res.json({ ok: true }));

/**
 * GET /api/availability?start=ISO&end=ISO
 * Returns busy windows (start/end) for the target calendar (manager by default).
 * Requires Authorization: Bearer <id_token> and x-oauth-access-token: <access>
 */
app.get('/api/availability', async (req, res) => {
  try {
    const { access } = requireAuth(req);
    const cal = calendarClient(access);

    const timeMin = String(req.query.start || '');
    const timeMax = String(req.query.end || '');
    if (!timeMin || !timeMax) {
      return res.status(400).json({ error: 'missing_dates' });
    }

    const fb = await cal.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: TARGET_CAL_ID }],
      },
    });

    // FreeBusy returns busy windows. UI expects {items:[{start,end}]}.
    const busy =
      (fb.data.calendars?.[TARGET_CAL_ID as 'primary'] as any)?.busy ??
      (fb.data.calendars?.primary as any)?.busy ??
      [];

    const items = busy.map((b: any) => ({ start: b.start, end: b.end }));
    return res.json({ items });
  } catch (e: any) {
    const details = e?.response?.data?.error?.message || e?.message || 'freebusy_failed';
    console.error('freebusy_failed', details);
    const status = e?.status || 500;
    return res.status(status).json({ error: 'freebusy_failed' });
  }
});

/**
 * GET /api/bookings?uid=<googleSub>
 * Lists upcoming bookings we created on the target calendar.
 * NOTE: The UI expects fields 'start' and 'end' — not 'startsAt/endsAt'.
 */
app.get('/api/bookings', async (req, res) => {
  try {
    const { access } = requireAuth(req);
    const cal = calendarClient(access);

    const now = new Date().toISOString();
    const events = await cal.events.list({
      calendarId: TARGET_CAL_ID,
      timeMin: now,
      singleEvents: true,
      orderBy: 'startTime',
      q: 'InnerPeace Session',
      maxResults: 50,
    });

    const items =
      (events.data.items || []).map((e) => ({
        id: e.id!,
        summary: e.summary || null,
        // 👇 Match front-end: 'start' / 'end'
        start: e.start?.dateTime || e.start?.date || null,
        end: e.end?.dateTime || e.end?.date || null,
        meetingUrl: e.hangoutLink || null,
        location: e.location || null,
      })) ?? [];

    return res.json({ ok: true, items });
  } catch (e: any) {
    const details = e?.response?.data?.error?.message || e?.message || 'list_bookings_failed';
    console.error('list_bookings_failed', details);
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: 'list_bookings_failed' });
  }
});

/**
 * POST /api/book
 * body: { start: ISO, end: ISO, email?: string, name?: string, mode: 'virtual'|'inperson', location?: string }
 * Creates the booking on the target (manager) calendar, invites the user + manager,
 * and (optionally) creates a Google Meet.
 */
app.post('/api/book', async (req, res) => {
  try {
    const { access } = requireAuth(req);
    const cal = calendarClient(access);

    const { start, end, email, name, mode, location } = req.body || {};
    if (!start || !end) return res.status(400).json({ error: 'missing_dates' });

    const wantMeet =
      USE_MEET === 'always'
        ? true
        : USE_MEET === 'never'
        ? false
        : String(mode || '').toLowerCase() === 'virtual';

    // Build attendees cleanly
    const attendees: calendar_v3.Schema$EventAttendee[] = [];
    if (email) attendees.push({ email });
    if (MANAGER_EMAIL && (!email || email !== MANAGER_EMAIL)) {
      attendees.push({
        email: MANAGER_EMAIL,
        displayName: 'InnerPeace Manager',
        responseStatus: 'accepted',
      });
    }

    const created = await cal.events.insert({
      calendarId: TARGET_CAL_ID,
      conferenceDataVersion: wantMeet ? 1 : 0,
      sendUpdates: (SEND_UPDATES as any) || 'all',
      requestBody: {
        summary: 'InnerPeace Session',
        description: name ? `Coaching session with ${name}` : 'Coaching session',
        start: { dateTime: start },
        end: { dateTime: end },
        attendees: attendees.length ? attendees : undefined,
        // Only set a physical location for in-person sessions
        location: !wantMeet ? (location || undefined) : undefined,
        conferenceData: wantMeet
          ? { createRequest: { requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2)}` } }
          : undefined,
        guestsCanModify: false,
        guestsCanInviteOthers: false,
        guestsCanSeeOtherGuests: true,
        transparency: 'opaque',
      },
    });

    return res.json({
      ok: true,
      id: created.data.id,
      meetingUrl: created.data.hangoutLink || null,
    });
  } catch (e: any) {
    const details = e?.response?.data?.error?.message || e?.message || 'booking_failed';
    console.error('booking_failed', details);
    const status = e?.status || 500;
    return res.status(status).json({ error: 'booking_failed', details });
  }
});

/**
 * DELETE /api/book/:id
 */
app.delete('/api/book/:id', async (req, res) => {
  try {
    const { access } = requireAuth(req);
    const cal = calendarClient(access);
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ error: 'missing_id' });

    await cal.events.delete({
      calendarId: TARGET_CAL_ID,
      eventId: id,
      sendUpdates: (SEND_UPDATES as any) || 'all',
    });

    return res.json({ ok: true });
  } catch (e: any) {
    console.error('cancel_failed:', e?.response?.data || e?.message || e);
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: 'cancel_failed' });
  }
});

/**
 * PUT /api/book/:id  (move/amend)
 * body: { start: ISO, end: ISO, location?: string }
 */
app.put('/api/book/:id', async (req, res) => {
  try {
    const { access } = requireAuth(req);
    const cal = calendarClient(access);
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ error: 'missing_id' });

    const { start, end, location } = req.body || {};
    if (!start || !end) return res.status(400).json({ error: 'missing_dates' });

    const updated = await cal.events.patch({
      calendarId: TARGET_CAL_ID,
      eventId: id,
      sendUpdates: (SEND_UPDATES as any) || 'all',
      requestBody: {
        start: { dateTime: start },
        end: { dateTime: end },
        location: location ?? undefined,
      },
    });

    return res.json({
      ok: true,
      eventId: updated.data.id,
      start: updated.data.start?.dateTime || updated.data.start?.date,
      end: updated.data.end?.dateTime || updated.data.end?.date,
      location: updated.data.location || null,
    });
  } catch (e: any) {
    console.error('amend_failed:', e?.response?.data || e?.message || e);
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: 'amend_failed' });
  }
});

const port = Number(PORT) || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`API listening on :${port}`);
  console.log(`Target calendar: ${TARGET_CAL_ID}`);
  if (MANAGER_EMAIL) console.log(`Manager email:   ${MANAGER_EMAIL}`);
});
