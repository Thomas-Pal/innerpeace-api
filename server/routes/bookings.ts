import { Router } from 'express';
import type { calendar_v3 } from 'googleapis';
import getCalendarClient from '../auth/calendarClient.js';
import { requireAuth } from '../middleware/auth.js';
import { targetCalendarId } from '../config/environment.js';
import { pickMeetUrl } from '../utils/events.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    requireAuth(req);
    const cal = await getCalendarClient();

    const now = new Date().toISOString();
    const events = await cal.events.list({
      calendarId: targetCalendarId,
      timeMin: now,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });

    const items = ((events.data.items || []) as calendar_v3.Schema$Event[])
      .filter(
        (e: calendar_v3.Schema$Event) =>
          (!!e.start?.dateTime || !!e.start?.date) && (!!e.end?.dateTime || !!e.end?.date)
      )
      .map((e: calendar_v3.Schema$Event) => ({
        id: e.id!,
        summary: e.summary || null,
        start: (e.start?.dateTime || e.start?.date || null) as string | null,
        end: (e.end?.dateTime || e.end?.date || null) as string | null,
        meetingUrl: pickMeetUrl(e),
        location: e.location || null,
        status: e.status || 'confirmed',
      }));

    return res.json({ ok: true, items });
  } catch (e: unknown) {
    console.error('list_bookings_failed', (e as any)?.response?.data || (e as Error)?.message || e);
    const status = (e as any)?.status || (e as any)?.response?.status || 500;
    return res.status(status).json({ ok: false, error: 'list_bookings_failed' });
  }
});

export default router;
