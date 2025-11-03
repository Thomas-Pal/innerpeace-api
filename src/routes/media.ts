import { Router, type Request, type Response } from 'express';
import { listMediaHandler } from '../http/media.js';
import { google } from 'googleapis';

const r = Router();

r.get('/media/list', listMediaHandler);

// --- Streaming endpoints (append; do NOT change /media/list) ---

// Local Drive client for streaming (kept separate so we don't touch list’s code)
function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

// Optional: fast HEAD for probes (returns headers only, no body)
r.head('/media/stream/:id', async (req: Request, res: Response) => {
  const fileId = req.params.id;
  try {
    const drive = getDriveClient();
    const meta = await drive.files.get({
      fileId,
      fields: 'size,mimeType',
      supportsAllDrives: true,
    });

    const total = Number(meta.data.size || 0);
    const mime = meta.data.mimeType || 'application/octet-stream';

    res.status(200).set({
      'Accept-Ranges': 'bytes',
      'Content-Type': mime,
      ...(Number.isFinite(total) ? { 'Content-Length': String(total) } : {}),
      'Cache-Control': 'private, max-age=0',
    });
    return res.end();
  } catch (e: any) {
    // Keep simple logging; do not alter global logger wiring
    console.warn('[media:head] error', e?.message);
    return res.status(404).send('Not Found');
  }
});

// GET with Range support (AVFoundation-friendly, efficient Drive fetch)
r.get('/media/stream/:id', async (req: Request, res: Response) => {
  const fileId = req.params.id;
  const range = (req.headers['range'] as string | undefined) || '';

  // Breadcrumbs without touching your logger infra
  try {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        tag: 'stream.req',
        id: (req as any)?.correlationId || null,
        fileId,
        range,
        ua: req.headers['user-agent'] || null,
        hasXSupabase: Boolean(req.headers['x-supabase-auth']),
      }),
    );
  } catch {}

  if (!fileId)
    return res.status(400).json({ code: 400, message: 'Missing file id' });

  try {
    const drive = getDriveClient();

    // 1) Fetch meta for size/mime
    const meta = await drive.files.get({
      fileId,
      fields: 'size,mimeType',
      supportsAllDrives: true,
    });
    const total = Number(meta.data.size || 0);
    const mime = meta.data.mimeType || 'application/octet-stream';

    // 2) If Range present, return partial; else stream full
    if (range.startsWith('bytes=')) {
      const [startStr, endStr] = range.replace('bytes=', '').split('-');
      const start = Number(startStr || 0);
      const end = endStr
        ? Math.min(Number(endStr), total - 1)
        : Math.min(start + 1024 * 1024 - 1, total - 1); // ~1MB chunk
      const chunkLen = end - start + 1;

      const driveRes = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream', headers: { Range: `bytes=${start}-${end}` } },
      );

      res.status(206).set({
        'Accept-Ranges': 'bytes',
        'Content-Type': mime,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': String(chunkLen),
        'Cache-Control': 'private, max-age=0',
      });

      driveRes.data.on('error', (err: any) => {
        console.warn('[media:stream] drive error', err?.message);
        res.destroy(err);
      });
      return driveRes.data.pipe(res);
    } else {
      // Some clients may request full body first
      const driveRes = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' },
      );
      res.status(200).set({
        'Content-Type': mime,
        ...(Number.isFinite(total) ? { 'Content-Length': String(total) } : {}),
        'Cache-Control': 'private, max-age=0',
      });
      driveRes.data.on('error', (err: any) => {
        console.warn('[media:stream] full drive error', err?.message);
        res.destroy(err);
      });
      return driveRes.data.pipe(res);
    }
  } catch (e: any) {
    console.error('[media:stream] error', e?.response?.data || e?.message || e);
    return res.status(404).json({ code: 404, message: 'Not found' });
  }
});

export default r;
