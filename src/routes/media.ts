import { Router } from 'express';
import { listMediaHandler } from '../http/media.js';
import { extractBearerToken, verifySupabaseJwt } from '../lib/supabaseJwt.js';
import { signStreamToken, verifyStreamToken } from '../lib/streamToken.js';
import { requireSupabaseAuth } from '../middleware/auth.js';
import { getDrive } from '../google/drive.js';

const router = Router();

router.get('/list', listMediaHandler);

router.get('/play/:id', requireSupabaseAuth, (req, res) => {
  const fileId = req.params.id;
  const exp = Math.floor(Date.now() / 1000) + 60;
  const token = signStreamToken({ id: fileId, exp, sub: (req as any).user?.sub });
  const host = req.get('host') || '';
  const origin = host.includes('gateway.dev')
    ? `https://${host}`
    : 'https://innerpeace-gw-4ubziwcf.nw.gateway.dev';
  res.json({
    url: `${origin}/api/media/stream/${encodeURIComponent(fileId)}?token=${encodeURIComponent(token)}`,
    exp,
  });
});

router.get('/stream/:id', async (req, res) => {
  const fileId = req.params.id;
  const tok = (req.query.token as string) || '';
  let allowed = false;
  const p = tok ? verifyStreamToken(tok) : null;
  if (p && p.id === fileId) allowed = true;
  if (!allowed) {
    const bearer = extractBearerToken(req);
    if (!bearer) return res.status(401).json({ code: 401, message: 'Unauthorized' });
    try {
      verifySupabaseJwt(bearer);
    } catch {
      return res.status(401).json({ code: 401, message: 'Unauthorized' });
    }
    allowed = true;
  }
  const drive = await getDrive();
  const meta = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType,size,md5Checksum,modifiedTime',
    supportsAllDrives: true,
  });
  const size = meta.data.size ? Number(meta.data.size) : undefined;
  const mime = meta.data.mimeType || 'application/octet-stream';
  const base: any = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=3600',
    ETag: meta.data.md5Checksum || meta.data.modifiedTime || meta.data.id!,
  };

  const range = req.headers.range as string | undefined;
  if (range && size) {
    const [s, e] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(s, 10);
    const end = e ? parseInt(e, 10) : Math.min(start + 2 * 1024 * 1024, size - 1);
    res
      .status(206)
      .set({ ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) });
    const r = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream', headers: { Range: `bytes=${start}-${end}` } }
    );
    return r.data.pipe(res);
  }
  res.status(200).set({ ...base, ...(size ? { 'Content-Length': String(size) } : {}) });
  const r = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );
  return r.data.pipe(res);
});

export default router;
