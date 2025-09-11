import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { google, calendar_v3 } from 'googleapis';
import getCalendarClient from './auth/calendarClient';

const app = express();
app.use(cors());
app.use(express.json());

/**
 * ENV:
 * - PORT
 * - CALENDAR_ID                (default 'primary')
 * - MANAGER_CALENDAR_ID        (should be the manager's email)
 * - MANAGER_EMAIL              (always invite this address)
 * - USE_MEET                   'auto' | 'always' | 'never' (default 'auto')
 * - SEND_UPDATES               'all' | 'externalOnly' | 'none' (default 'all')
 *
 * DWD auth (required):
 * - GOOGLE_DELEGATED_USER      (e.g. thomaspal@innerpeace-developer.co.uk)
 * - GOOGLE_DWD_SA_KEY_JSON or GOOGLE_DWD_SA_KEY_PATH
 */
const {
  PORT = '8080',
  CALENDAR_ID = 'primary',
  MANAGER_CALENDAR_ID = '',
  MANAGER_EMAIL = 'thomaspal@innerpeace-developer.co.uk',
  USE_MEET = 'auto',
  SEND_UPDATES = 'all',
} = process.env as Record<string, string>;

const TARGET_CAL_ID = MANAGER_CALENDAR_ID || CALENDAR_ID;

type Authed = { idJwt: string; userId?: string };
function requireAuth(req: express.Request): Authed {
  const idJwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const userId = (req.headers['x-user-id'] as string | undefined) || undefined;
  if (!idJwt) {
    const err: any = new Error('Missing ID token');
    err.status = 401;
    throw err;
  }
  return { idJwt, userId };
}

function pickMeetUrl(ev: any): string | null {
  const ep = ev?.conferenceData?.entryPoints;
  const fromEp =
    Array.isArray(ep) && ep.find((x: any) => x?.entryPointType === 'video')?.uri;
  return ev?.hangoutLink || fromEp || null;
}

app.get('/healthz', async (_req, res) => {
  try {
    // smoke-test the DWD client init
    await getCalendarClient();
    res.json({ ok: true, targetCalendar: TARGET_CAL_ID, auth: 'DWD' });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'init_failed' });
  }
});

// ---------------------- Availability (FreeBusy) ------------------------------
app.get('/api/availability', async (req, res) => {
  try {
    requireAuth(req); // app-level auth only
    const cal = await getCalendarClient();

    const timeMin = String(req.query.start || '');
    const timeMax = String(req.query.end || '');
    if (!timeMin || !timeMax) return res.status(400).json({ error: 'missing_dates' });

    const fb = await cal.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: TARGET_CAL_ID }], // ask for manager calendar explicitly
      },
    });

    // IMPORTANT: index by EXACT id requested; never fall back to 'primary'
    const calEntry = (fb.data.calendars as any)?.[TARGET_CAL_ID];
    if (!calEntry) {
      return res.status(403).json({
        error: 'no_access_to_calendar',
        calendarId: TARGET_CAL_ID,
      });
    }

    const busy = Array.isArray(calEntry.busy) ? calEntry.busy : [];
    const items = busy
      .filter((b: any) => b?.start && b?.end)
      .map((b: any) => ({ start: b.start, end: b.end }));

    return res.json({ items });
  } catch (e: any) {
    console.error('freebusy_failed', e?.response?.data || e?.message || e);
    const status = e?.status || e?.response?.status || 500;
    return res.status(status).json({ error: 'freebusy_failed' });
  }
});

// ---------------------- List bookings ---------------------------------------
app.get('/api/bookings', async (_req, res) => {
  try {
    requireAuth(_req);
    const cal = await getCalendarClient();

    const now = new Date().toISOString();
    const events = await cal.events.list({
      calendarId: TARGET_CAL_ID,
      timeMin: now,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });

    const items =
      (events.data.items || [])
        .filter((e) => (e.start?.dateTime || e.start?.date) && (e.end?.dateTime || e.end?.date))
        .map((e) => ({
          id: e.id!,
          summary: e.summary || null,
          start: e.start?.dateTime || e.start?.date || null, // front-end expects start/end
          end: e.end?.dateTime || e.end?.date || null,
          meetingUrl:
            e.hangoutLink ||
            ((e.conferenceData?.entryPoints || []).find((p) => p.entryPointType === 'video')?.uri ?? null),
          location: e.location || null,
          status: e.status || 'confirmed',
        }));

    return res.json({ ok: true, items });
  } catch (e: any) {
    console.error('list_bookings_failed', e?.response?.data || e?.message || e);
    const status = e?.status || e?.response?.status || 500;
    return res.status(status).json({ ok: false, error: 'list_bookings_failed' });
  }
});

// ---------------------- Create booking --------------------------------------
app.post('/api/book', async (req, res) => {
  try {
    requireAuth(req);
    const cal = await getCalendarClient();

    const { start, end, email, name, mode, location } = req.body || {};
    if (!start || !end) return res.status(400).json({ error: 'missing_dates' });

    const wantMeet =
      USE_MEET === 'always'
        ? true
        : USE_MEET === 'never'
        ? false
        : String(mode || '').toLowerCase() === 'virtual';

    const attendees: calendar_v3.Schema$EventAttendee[] = [];
    if (email) attendees.push({ email, displayName: name || undefined });
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

    const meetingUrl =
      created.data.hangoutLink ||
      ((created.data.conferenceData?.entryPoints || []).find((p) => p.entryPointType === 'video')?.uri ?? null);

    return res.json({ ok: true, id: created.data.id, meetingUrl: meetingUrl || null });
  } catch (e: any) {
    console.error('booking_failed', e?.response?.data || e?.message || e);
    const status = e?.status || e?.response?.status || 500;
    return res.status(status).json({ error: 'booking_failed' });
  }
});

// ---------------------- Cancel booking --------------------------------------
app.delete('/api/book/:id', async (req, res) => {
  try {
    requireAuth(req);
    const cal = await getCalendarClient();

    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ error: 'missing_id' });

    await cal.events.delete({
      calendarId: TARGET_CAL_ID,
      eventId: id,
      sendUpdates: (SEND_UPDATES as any) || 'all',
    });

    return res.json({ ok: true });
  } catch (e: any) {
    console.error('cancel_failed', e?.response?.data || e?.message || e);
    const status = e?.status || e?.response?.status || 500;
    return res.status(status).json({ ok: false, error: 'cancel_failed' });
  }
});

// ---------------------- Amend booking ---------------------------------------
app.put('/api/book/:id', async (req, res) => {
  try {
    requireAuth(req);
    const cal = await getCalendarClient();

    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ error: 'missing_id' });

    const { start, end, location } = req.body || {};
    if (!start || !end) return res.status(400).json({ error: 'missing_dates' });

    const updated = await cal.events.patch({
      calendarId: TARGET_CAL_ID,
      eventId: id,
      conferenceDataVersion: 1,
      sendUpdates: (SEND_UPDATES as any) || 'all',
      requestBody: {
        start: { dateTime: start },
        end: { dateTime: end },
        location: location ?? undefined,
      },
    });

    const meetingUrl =
      updated.data.hangoutLink ||
      ((updated.data.conferenceData?.entryPoints || []).find((p) => p.entryPointType === 'video')?.uri ?? null);

    return res.json({
      ok: true,
      eventId: updated.data.id,
      start: updated.data.start?.dateTime || updated.data.start?.date,
      end: updated.data.end?.dateTime || updated.data.end?.date,
      location: updated.data.location || null,
      meetingUrl: meetingUrl || null,
    });
  } catch (e: any) {
    console.error('amend_failed', e?.response?.data || e?.message || e);
    const status = e?.status || e?.response?.status || 500;
    return res.status(status).json({ ok: false, error: 'amend_failed' });
  }
});

const port = Number(PORT) || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`API listening on :${port}`);
  console.log(`Target calendar: ${TARGET_CAL_ID}`);
  console.log(`Auth mode: DWD (impersonating ${process.env.GOOGLE_DELEGATED_USER || 'unset'})`);
});
