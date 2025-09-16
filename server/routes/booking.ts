import { Router } from 'express';
import type { calendar_v3 } from 'googleapis';
import getCalendarClient from '../auth/calendarClient.js';
import { requireAuth } from '../middleware/auth.js';
import config, { targetCalendarId } from '../config/environment.js';
import { pickMeetUrl } from '../utils/events.js';

const router = Router();

function shouldCreateMeet(mode?: string | null): boolean {
  if (config.useMeet === 'always') return true;
  if (config.useMeet === 'never') return false;
  return String(mode || '').toLowerCase() === 'virtual';
}

router.post('/', async (req, res) => {
  try {
    requireAuth(req);
    const cal = await getCalendarClient();

    const { start, end, email, name, mode, location } = (req.body || {}) as {
      start?: string;
      end?: string;
      email?: string;
      name?: string;
      mode?: string;
      location?: string;
    };
    if (!start || !end) return res.status(400).json({ error: 'missing_dates' });

    const wantMeet = shouldCreateMeet(mode);

    const attendees: calendar_v3.Schema$EventAttendee[] = [];
    if (email) attendees.push({ email, displayName: name || undefined });
    if (config.managerEmail && (!email || email !== config.managerEmail)) {
      attendees.push({
        email: config.managerEmail,
        displayName: 'InnerPeace Manager',
        responseStatus: 'accepted',
      });
    }

    const created = await cal.events.insert({
      calendarId: targetCalendarId,
      conferenceDataVersion: wantMeet ? 1 : 0,
      sendUpdates: config.sendUpdates,
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

    const meetingUrl = pickMeetUrl(created.data as calendar_v3.Schema$Event) || null;

    return res.json({ ok: true, id: created.data.id, meetingUrl });
  } catch (e: unknown) {
    console.error('booking_failed', (e as any)?.response?.data || (e as Error)?.message || e);
    const status = (e as any)?.status || (e as any)?.response?.status || 500;
    return res.status(status).json({ error: 'booking_failed' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    requireAuth(req);
    const cal = await getCalendarClient();

    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ error: 'missing_id' });

    await cal.events.delete({
      calendarId: targetCalendarId,
      eventId: id,
      sendUpdates: config.sendUpdates,
    });

    return res.json({ ok: true });
  } catch (e: unknown) {
    console.error('cancel_failed', (e as any)?.response?.data || (e as Error)?.message || e);
    const status = (e as any)?.status || (e as any)?.response?.status || 500;
    return res.status(status).json({ ok: false, error: 'cancel_failed' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    requireAuth(req);
    const cal = await getCalendarClient();

    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ error: 'missing_id' });

    const { start, end, location } = (req.body || {}) as {
      start?: string;
      end?: string;
      location?: string;
    };
    if (!start || !end) return res.status(400).json({ error: 'missing_dates' });

    const updated = await cal.events.patch({
      calendarId: targetCalendarId,
      eventId: id,
      conferenceDataVersion: 1,
      sendUpdates: config.sendUpdates,
      requestBody: {
        start: { dateTime: start },
        end: { dateTime: end },
        location: location ?? undefined,
      },
    });

    const meetingUrl = pickMeetUrl(updated.data as calendar_v3.Schema$Event) || null;

    return res.json({
      ok: true,
      eventId: updated.data.id,
      start: updated.data.start?.dateTime || updated.data.start?.date,
      end: updated.data.end?.dateTime || updated.data.end?.date,
      location: updated.data.location || null,
      meetingUrl,
    });
  } catch (e: unknown) {
    console.error('amend_failed', (e as any)?.response?.data || (e as Error)?.message || e);
    const status = (e as any)?.status || (e as any)?.response?.status || 500;
    return res.status(status).json({ ok: false, error: 'amend_failed' });
  }
});

export default router;
