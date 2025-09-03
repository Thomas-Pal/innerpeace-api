import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { v4 as uuid } from 'uuid';
import getCalendarClient from './auth/calendarClient.js';

const app = express();
app.use(cors());
app.use(express.json());

const {
  PORT = 8080,
  AUTH_MODE = 'keyless-dwd',
  CALENDAR_ID,
  USE_MEET = 'auto'
} = process.env;

const WANT_MEET = String(USE_MEET || 'auto').toLowerCase();

app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime(), mode: 'CloudRun' }));

app.get('/api/availability', async (req, res) => {
  try {
    const { start, end } = req.query as { start?: string; end?: string };
    if (!start || !end) return res.status(400).json({ error: 'start and end (ISO) are required' });

    const calendar = await getCalendarClient(AUTH_MODE as any);
    const calId = CALENDAR_ID || 'primary';
    const fb = await calendar.freebusy.query({
      requestBody: { timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString(), items: [{ id: calId }] }
    });
    const busy = fb.data.calendars?.[calId]?.busy || [];
    res.json({ busy });
  } catch (e:any) {
    console.error('freebusy_failed:', e?.response?.data || e?.message || e);
    res.status(500).json({ error: 'freebusy_failed' });
  }
});

app.post('/api/book', async (req, res) => {
  try {
    const { start, end, email, name, mode, location } = req.body || {};
    if (!start || !end) return res.status(400).json({ error: 'start and end required' });

    const calendar = await getCalendarClient(AUTH_MODE as any);
    const isInPerson = String(mode || '').toLowerCase() === 'inperson';
    const finalLocation = isInPerson ? (String(location || '').trim() || 'Office / Gym') : undefined;

    const displayName =
      (name && String(name).trim()) ||
      (email && String(email).split('@')[0]) ||
      'Client';
    const summary = `${displayName}: ${isInPerson ? 'In-Person Session' : 'Virtual Session'}`;
    const requestId = uuid();
    const calId = CALENDAR_ID || 'primary';

    const baseBody: any = {
      summary,
      description: name ? `Booked by ${name}${email ? ` (${email})` : ''}` : `Booked via app${email ? ` (${email})` : ''}`,
      start: { dateTime: new Date(start).toISOString() },
      end:   { dateTime: new Date(end).toISOString() },
      ...(finalLocation ? { location: finalLocation } : {}),
      attendees: email ? [{ email, displayName: name || undefined }] : undefined,
      guestsCanModify: false, guestsCanInviteOthers: false, guestsCanSeeOtherGuests: false
    };

    const wantMeet = !isInPerson && WANT_MEET !== 'never';
    const sendUpdates = baseBody.attendees ? 'all' : 'none';

    const insert = (body:any) => calendar.events.insert({
      calendarId: calId, conferenceDataVersion: wantMeet ? 1 : 0, sendUpdates, requestBody: body
    });

    const patchWithMeet = (eventId:string) => calendar.events.patch({
      calendarId: calId, eventId, conferenceDataVersion: 1, sendUpdates,
      requestBody: { conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } } }
    });

    let event:any, usedMeet = false;

    if (wantMeet) {
      try {
        const r = await insert({ ...baseBody,
          conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } } });
        event = r.data; usedMeet = true;
      } catch {
        const r1 = await insert(baseBody);
        event = r1.data;
        try { const r2 = await patchWithMeet(event.id); event = r2.data; usedMeet = true; }
        catch (e2:any) { if (WANT_MEET === 'force') return res.status(500).json({ error: 'booking_failed', details: e2?.message }); }
      }
    } else {
      const r = await insert(baseBody);
      event = r.data;
    }

    const hangoutLink =
      event.hangoutLink ||
      (event.conferenceData?.entryPoints || []).find((x:any) => x?.entryPointType === 'video')?.uri || null;

    res.json({ ok: true, eventId: event.id, start: event.start?.dateTime || event.start?.date || start,
      end: event.end?.dateTime || event.end?.date || end, summary: event.summary, location: event.location || null,
      usedMeet, hangoutLink });
  } catch (e:any) {
    console.error('booking_failed:', e?.response?.data || e?.message || e);
    res.status(500).json({ error: 'booking_failed', details: e?.message });
  }
});

app.get('/api/bookings', async (req, res) => {
  try {
    const { email, maxResults = 50, timeMin, timeMax } = req.query as any;
    const calendar = await getCalendarClient(AUTH_MODE as any);
    const calId = CALENDAR_ID || 'primary';
    const now = new Date(); const defaultMax = new Date(now.getTime() + 90 * 86400000);

    const r = await calendar.events.list({
      calendarId: calId, singleEvents: true, orderBy: 'startTime',
      timeMin: timeMin ? new Date(String(timeMin)).toISOString() : now.toISOString(),
      timeMax: timeMax ? new Date(String(timeMax)).toISOString() : defaultMax.toISOString(),
      maxResults: Number(maxResults)
    });

    let items = (r.data.items || []).filter(ev => ev.status !== 'cancelled');
    if (email) {
      const want = String(email).toLowerCase();
      items = items.filter(ev => (ev.attendees || []).some(a => (a.email || '').toLowerCase() === want));
    }

    const pickMeet = (ev:any) =>
      ev.hangoutLink || (ev.conferenceData?.entryPoints || []).find((x:any) => x?.entryPointType === 'video')?.uri || null;

    res.json({ ok: true, events: items.map(ev => ({
      id: ev.id, start: ev.start?.dateTime || ev.start?.date, end: ev.end?.dateTime || ev.end?.date,
      status: ev.status, summary: ev.summary, location: ev.location || null,
      hangoutLink: pickMeet(ev), attendees: ev.attendees || []
    }))});
  } catch (e:any) {
    console.error('list_bookings_failed:', e?.response?.data || e?.message || e);
    res.status(500).json({ ok: false, error: 'list_bookings_failed' });
  }
});

app.delete('/api/book/:id', async (req, res) => {
  try {
    const calendar = await getCalendarClient(AUTH_MODE as any);
    await calendar.events.delete({ calendarId: CALENDAR_ID || 'primary', eventId: req.params.id, sendUpdates: 'all' });
    res.json({ ok: true });
  } catch (e:any) {
    console.error('cancel_failed:', e?.response?.data || e?.message || e);
    res.status(500).json({ ok: false, error: 'cancel_failed' });
  }
});

app.patch('/api/book/:id', async (req, res) => {
  try {
    const { start, end, location } = req.body || {};
    if (!start || !end) return res.status(400).json({ ok: false, error: 'start and end required' });

    const calendar = await getCalendarClient(AUTH_MODE as any);
    const updated = await calendar.events.patch({
      calendarId: CALENDAR_ID || 'primary', eventId: req.params.id, sendUpdates: 'all',
      requestBody: {
        start: { dateTime: new Date(start).toISOString() },
        end:   { dateTime: new Date(end).toISOString() },
        ...(typeof location === 'string' ? { location } : {})
      }
    });

    res.json({
      ok: true,
      eventId: updated.data.id,
      start: updated.data.start?.dateTime || updated.data.start?.date,
      end: updated.data.end?.dateTime || updated.data.end?.date,
      location: updated.data.location || null
    });
  } catch (e:any) {
    console.error('amend_failed:', e?.response?.data || e?.message || e);
    res.status(500).json({ ok: false, error: 'amend_failed' });
  }
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, '0.0.0.0', () => console.log(`API listening on :${port}`));
