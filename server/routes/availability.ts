import type { Request, Response } from 'express';
import { getCalendarClient } from '../utils/googleCalendar.js';
import { requireUser } from '../middleware/auth.js';
import { targetCalendarId } from '../config/environment.js';

export async function availabilityHandler(req: Request, res: Response) {
  try {
    requireUser(req);
    const calendar = await getCalendarClient();

    const timeMin = String(req.query.start || '');
    const timeMax = String(req.query.end || '');
    if (!timeMin || !timeMax) {
      return res.status(400).json({ error: 'missing_dates' });
    }

    const fb = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: targetCalendarId }],
      },
    });

    const calEntry = (fb.data.calendars as any)?.[targetCalendarId];
    if (!calEntry) {
      return res
        .status(403)
        .json({ error: 'no_access_to_calendar', calendarId: targetCalendarId });
    }

    const busy = Array.isArray(calEntry.busy) ? (calEntry.busy as any[]) : [];
    const items = busy
      .filter((b: any) => b?.start && b?.end)
      .map((b: any) => ({ start: b.start as string, end: b.end as string }));

    return res.json({ items });
  } catch (error: unknown) {
    const status = (error as any)?.status || (error as any)?.response?.status;
    if (status === 401) {
      return res.status(401).json({ code: 401, message: 'Missing JWT' });
    }

    console.error(
      '[availability] freebusy_failed',
      (error as any)?.response?.data || (error as Error)?.message || error,
    );
    return res.status(500).json({ error: 'freebusy_failed' });
  }
}
