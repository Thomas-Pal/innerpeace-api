import { Router } from 'express';
import getCalendarClient from '../auth/calendarClient.js';
import { targetCalendarId } from '../config/environment.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    await getCalendarClient();
    res.json({ ok: true, targetCalendar: targetCalendarId, auth: 'DWD' });
  } catch (e: unknown) {
    const msg = (e as Error)?.message || 'init_failed';
    res.status(500).json({ ok: false, error: msg });
  }
});

export default router;
