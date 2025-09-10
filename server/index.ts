// server/index.ts
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { google } from 'googleapis';

const app = express();
app.use(cors());
app.use(express.json());

const {
  PORT = '8080',

  // Where to CREATE/LIST events (stay on user's primary)
  USER_CALENDAR_ID = 'primary',

  // Where to READ availability (manager’s calendar ID, e.g. thomaspal@innerpeace-developer.co.uk
  // or the long calendar ID from "Integrate calendar")
  AVAILABILITY_CALENDAR_ID = process.env.MANAGER_CALENDAR_ID || 'primary',

  // Meeting link policy
  USE_MEET = 'auto', // 'auto' | 'always' | 'never'

  // Manager gets invited to each booking so they see everything
  MANAGER_EMAIL = 'thomaspal@innerpeace-developer.co.uk',
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

app.get('/healthz', (_req, res) => res.json({ ok: true }));

/**
 * GET /api/availability?start=ISO&end=ISO
 * Reads FREE/BUSY from the manager’s calendar (AVAILABILITY_CALENDAR_ID).
 * Requires the user's Google account to have at least "See all event details" access
 * to that calendar, OR you must switch to a service account with domain-wide delegation.
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
        items: [{ id: AVAILABILITY_CALENDAR_ID }],
      },
    });

    const key = AVAILABILITY_CALENDAR_ID as 'primary';
    const busy = (fb.data.calendars?.[key] as any)?.busy ?? [];
    const items = busy.map((b: any) => ({ start: b.start, end: b.end }));
    res.json({ items });
  } catch (e: any) {
    const details = e?.response?.data?.error?.message || e?.message || 'freebusy_failed';
    console.error('freebusy_failed', details);
    // 403/404 from Calendar here usually means the user token cannot see the manager calendar.
    res.status(500).json({ error: 'freebusy_failed' });
  }
});

/**
 * GET /api/bookings?uid=googleSub
 * Lists upcoming events created by the app on the USER's calendar.
 */
app.get('/api/bookings', async (req, res) => {
  try {
    const { access } = requireAuth(req);
    const cal = calendarClient(access);

    const now = new Date().toISOString();
    const events = await cal.events.list({
      calendarId: USER_CALENDAR_ID,
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
      meetingUrl: e.hangoutLink || null,
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
 * Creates the event on the USER's calendar and invites the manager.
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

    const attendees = [
      ...(email ? [{ email }] : []),
      ...(MANAGER_EMAIL ? [{ email: MANAGER_EMAIL, displayName: 'InnerPeace Manager' }] : []),
    ];

    const created = await cal.events.insert({
      calendarId: USER_CALENDAR_ID,
      conferenceDataVersion: wantMeet ? 1 : 0,
      requestBody: {
        summary: 'InnerPeace Session',
        description: name ? `Coaching session with ${name}` : 'Coaching session',
        start: { dateTime: start },
        end: { dateTime: end },
        attendees: attendees.length ? attendees : undefined,
        location: !wantMeet ? (location || 'TBD') : undefined,
        conferenceData: wantMeet
          ? { createRequest: { requestId: `meet-${Date.now()}` } }
          : undefined,
      },
    });

    res.json({
      ok: true,
      id: created.data.id,
      meetingUrl: created.data.hangoutLink || null,
    });
  } catch (e: any) {
    const details = e?.response?.data?.error?.message || e?.message || 'booking_failed';
    console.error('booking_failed', details);
    res.status(500).json({ error: 'booking_failed', details });
  }
});

/**
 * DELETE /api/book/:id
 */
app.delete('/api/book/:id', async (req, res) => {
  try {
    const { access } = requireAuth(req);
    const cal = calendarClient(access);
    const id = String(req.params.id);
    if (!id) return res.status(400).json({ error: 'missing_id' });

    await cal.events.delete({ calendarId: USER_CALENDAR_ID, eventId: id });
    res.json({ ok: true });
  } catch (e: any) {
    console.error('cancel_failed:', e?.response?.data || e?.message || e);
    res.status(500).json({ ok: false, error: 'cancel_failed' });
  }
});

/**
 * PUT /api/book/:id  (move/amend)
 */
app.put('/api/book/:id', async (req, res) => {
  try {
    const { access } = requireAuth(req);
    const cal = calendarClient(access);
    const id = String(req.params.id);
    if (!id) return res.status(400).json({ error: 'missing_id' });

    const { start, end, location } = req.body || {};
    if (!start || !end) return res.status(400).json({ error: 'missing_dates' });

    const updated = await cal.events.patch({
      calendarId: USER_CALENDAR_ID,
      eventId: id,
      requestBody: {
        start: { dateTime: start },
        end: { dateTime: end },
        location: location ?? undefined,
      },
    });

    res.json({
      ok: true,
      eventId: updated.data.id,
      start: updated.data.start?.dateTime || updated.data.start?.date,
      end: updated.data.end?.dateTime || updated.data.end?.date,
      location: updated.data.location || null,
    });
  } catch (e: any) {
    console.error('amend_failed:', e?.response?.data || e?.message || e);
    res.status(500).json({ ok: false, error: 'amend_failed' });
  }
});

const port = Number(PORT) || 8080;
app.listen(port, '0.0.0.0', () => console.log(`API listening on :${port}`));
