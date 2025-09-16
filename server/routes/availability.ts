import { Router } from 'express';
import getCalendarClient from '../auth/calendarClient.js';
import { requireAuth } from '../middleware/auth.js';
import { targetCalendarId } from '../config/environment.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    requireAuth(req);
    const cal = await getCalendarClient();

    const timeMin = String(req.query.start || '');
    const timeMax = String(req.query.end || '');
    if (!timeMin || !timeMax) return res.status(400).json({ error: 'missing_dates' });

    const fb = await cal.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: targetCalendarId }],
      },
    });

    const calEntry = (fb.data.calendars as any)?.[targetCalendarId];
    if (!calEntry) {
      return res.status(403).json({ error: 'no_access_to_calendar', calendarId: targetCalendarId });
    }

    const busy = Array.isArray(calEntry.busy) ? (calEntry.busy as any[]) : [];
    const items = busy
      .filter((b: any) => b?.start && b?.end)
      .map((b: any) => ({ start: b.start as string, end: b.end as string }));

    return res.json({ items });
  } catch (e: unknown) {
    console.error('freebusy_failed', (e as any)?.response?.data || (e as Error)?.message || e);
    const status = (e as any)?.status || (e as any)?.response?.status || 500;
    return res.status(status).json({ error: 'freebusy_failed' });
  }
});

export default router;
