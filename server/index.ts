import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { google } from 'googleapis';

const app = express();
app.use(cors());
app.use(express.json());

const {
  PORT = '8080',
  CALENDAR_ID = 'thomaspal@innerpeace-developer.co.uk', // manager calendar
  MANAGER_EMAIL = 'thomaspal@innerpeace-developer.co.uk',
  USE_MEET = 'auto', // 'auto' | 'always' | 'never'
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
 * Requires calendar.readonly OR calendar.events scope.
 */
app.get('/api/availability', async (req, res) => {
  try {
    const { access } = requireAuth(req);
    const cal = calendarClient(access);

    const timeMin = String(req.query.start);
    const timeMax = String(req.query.end);
    if (!timeMin || !timeMax) return res.status(400).json({ error: 'missing_dates' });

    const fb = await cal.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: CALENDAR_ID }],
      },
    });

    const busy = (fb.data.calendars?.[CALENDAR_ID as 'primary'] as any)?.busy ?? [];
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
 * Lists upcoming events on the manager calendar (no hard filter on text).
 */
app.get('/api/bookings', async (req, res) => {
  try {
    const { access } = requireAuth(req);
    const cal = calendarClient(access);

    // small look-back so a just-created event isn’t dropped by time drift
    const timeMin = new Date(Date.now() - 60_000).toISOString();

    const events = await cal.events.list({
      calendarId: CALENDAR_ID,
      timeMin,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
      conferenceDataVersion: 1, // ← ensure Meet info is returned
      // You can add q: 'InnerPeace Session' if you only want IP events,
      // but leaving it off returns all events on the manager calendar.
    });

    const items = (events.data.items || []).map((e) => {
      const meetingUrl =
        e.hangoutLink ||
        (e.conferenceData?.entryPoints || []).find((p: any) => p.entryPointType === 'video')?.uri ||
        null;
      return {
        id: e.id!,
        summary: e.summary || 'InnerPeace Session',
        startsAt: e.start?.dateTime || e.start?.date || null,
        endsAt: e.end?.dateTime || e.end?.date || null,
        meetingUrl,
        location: e.location || null,
        status: (e.status as any) || 'confirmed',
      };
    });

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
 * Creates on the manager calendar (CALENDAR_ID).
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

    const created = await cal.events.insert({
      calendarId: CALENDAR_ID,
      conferenceDataVersion: wantMeet ? 1 : 0,
      sendUpdates: 'all',
      requestBody: {
        summary: 'InnerPeace Session',
        description: name ? `Coaching session with ${name}` : 'Coaching session',
        start: { dateTime: start },
        end: { dateTime: end },
        attendees: [
          ...(email ? [{ email }] : []),
          { email: MANAGER_EMAIL, displayName: 'InnerPeace Manager (Simon)' },
        ],
        location: !wantMeet ? (location || 'TBD') : undefined,
        conferenceData: wantMeet
          ? { createRequest: { requestId: `meet-${Date.now()}` } }
          : undefined,
      },
    });

    const meetingUrl =
      created.data.hangoutLink ||
      (created.data.conferenceData?.entryPoints || []).find(
        (p: any) => p.entryPointType === 'video'
      )?.uri ||
      null;

    res.json({
      ok: true,
      id: created.data.id,
      meetingUrl,
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

    await cal.events.delete({ calendarId: CALENDAR_ID, eventId: id, sendUpdates: 'all' });
    res.json({ ok: true });
  } catch (e: any) {
    console.error('cancel_failed:', e?.response?.data || e?.message || e);
    res.status(500).json({ ok: false, error: 'cancel_failed' });
  }
});

/**
 * PUT /api/book/:id  (move/amend)
 * body: { start, end, location? }
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
      calendarId: CALENDAR_ID,
      eventId: id,
      conferenceDataVersion: 1,
      sendUpdates: 'all',
      requestBody: {
        start: { dateTime: start },
        end: { dateTime: end },
        location: location ?? undefined,
      },
    });

    const meetingUrl =
      updated.data.hangoutLink ||
      (updated.data.conferenceData?.entryPoints || []).find(
        (p: any) => p.entryPointType === 'video'
      )?.uri ||
      null;

    res.json({
      ok: true,
      eventId: updated.data.id,
      start: updated.data.start?.dateTime || updated.data.start?.date,
      end: updated.data.end?.dateTime || updated.data.end?.date,
      location: updated.data.location || null,
      meetingUrl,
    });
  } catch (e: any) {
    console.error('amend_failed:', e?.response?.data || e?.message || e);
    res.status(500).json({ ok: false, error: 'amend_failed' });
  }
});

const port = Number(PORT) || 8080;
app.listen(port, '0.0.0.0', () => console.log(`API listening on :${port}`));
