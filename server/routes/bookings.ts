import type { Request, Response } from 'express';
import type { calendar_v3 } from 'googleapis';
import { getCalendarClient } from '../utils/googleCalendar.js';
import { requireUser } from '../middleware/auth.js';
import { targetCalendarId } from '../config/environment.js';
import { pickMeetUrl } from '../utils/events.js';

export async function listBookings(req: Request, res: Response) {
  try {
    requireUser(req);
    const calendar = await getCalendarClient();

    const now = new Date().toISOString();
    const events = await calendar.events.list({
      calendarId: targetCalendarId,
      timeMin: now,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });

    const items = ((events.data.items || []) as calendar_v3.Schema$Event[])
      .filter(
        (e: calendar_v3.Schema$Event) =>
          (!!e.start?.dateTime || !!e.start?.date) &&
          (!!e.end?.dateTime || !!e.end?.date),
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
  } catch (error: unknown) {
    const status = (error as any)?.status || (error as any)?.response?.status;
    if (status === 401) {
      return res.status(401).json({ code: 401, message: 'Missing JWT' });
    }

    console.error(
      '[bookings] list_bookings_failed',
      (error as any)?.response?.data || (error as Error)?.message || error,
    );
    return res.status(500).json({ ok: false, error: 'list_bookings_failed' });
  }
}
