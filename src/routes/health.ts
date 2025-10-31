import { Router } from 'express';
import { getDrive } from '../google/drive.js';
const r = Router();

r.get('/health', (_req, res) => res.json({ ok: true }));

r.get('/health/drive', async (_req, res) => {
  try {
    const drive = await getDrive();
    await drive.files.list({ pageSize: 1, fields: 'files(id)' });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'failed' });
  }
});

export default r;
