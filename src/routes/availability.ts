import { Router } from 'express';

const r = Router();

/** Auth-protected placeholder – returns empty busy slots */
r.get('/', async (_req, res) => {
  return res.json({ items: [] });
});

export default r;
