import { Router } from 'express';
import { requireUser } from '../middleware/requireUser.js';

const r = Router();

/** Auth-protected placeholder – returns empty busy slots */
r.get('/', requireUser, async (_req, res) => {
  return res.json({ items: [] });
});

export default r;
