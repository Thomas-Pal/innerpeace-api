// server/src/routes/media.ts
import { Router } from 'express';
import { google } from 'googleapis';

const router = Router();
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID!;
const CACHE_TTL = Number(process.env.DRIVE_CACHE_TTL ?? 300);
let cache: { expires: number; items: any[] } | null = null;

function driveClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

// GET /api/media/list
router.get('/list', async (req, res) => {
  try {
    if (cache && Date.now() < cache.expires) {
      return res.json({ ok: true, items: cache.items });
    }

    const drive = driveClient();
    // List only files in the folder (no trashed)
    const q = `'${DRIVE_FOLDER_ID}' in parents and trashed = false`;
    const { data } = await drive.files.list({
      q,
      pageSize: 1000,
      fields: 'files(id,name,mimeType,modifiedTime,size,thumbnailLink)',
      orderBy: 'modifiedTime desc',
    });

    const items =
      data.files?.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        modifiedTime: f.modifiedTime,
        thumb: f.thumbnailLink ?? null,
      })) ?? [];

    cache = { expires: Date.now() + CACHE_TTL * 1000, items };
    res.json({ ok: true, items });
  } catch (e: any) {
    console.error('[media:list] error', e);
    res.status(500).json({ ok: false, message: 'List failed' });
  }
});

// GET /api/media/stream/:id
// Streams bytes with Range support so <Video> / audio players can seek.
router.get('/stream/:id', async (req, res) => {
  const fileId = req.params.id;
  try {
    const drive = driveClient();

    // Get basic metadata for headers
    const meta = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType,size',
      supportsAllDrives: true,
    });
    const size = Number(meta.data.size ?? 0);
    const mime = meta.data.mimeType ?? 'application/octet-stream';

    const range = req.headers.range;
    let start = 0,
      end = size ? size - 1 : undefined;

    if (range && size) {
      const [s, e] = range.replace(/bytes=/, '').split('-');
      start = parseInt(s, 10);
      end = e ? parseInt(e, 10) : Math.min(start + 1024 * 1024 - 1, size - 1);
      res.status(206);
      res.set({
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Content-Type': mime,
      });
    } else {
      res.status(200);
      if (size) res.set({ 'Content-Length': String(size) });
      res.set({ 'Content-Type': mime });
    }

    const driveStream = await drive.files.get(
      { fileId, alt: 'media' as any },
      { responseType: 'stream' }
    );

    // If ranged, skip bytes on the fly
    if (range && size) {
      let passed = 0;
      driveStream.data.on('data', (chunk: Buffer) => {
        const next = passed + chunk.length;
        // Only write the requested slice
        const writeStart = Math.max(start - passed, 0);
        const writeEnd = Math.min(end - passed + 1, chunk.length);
        if (writeStart < writeEnd) {
          res.write(chunk.subarray(writeStart, writeEnd));
        }
        passed = next;
        if (passed > end) {
          res.end();
          driveStream.data.destroy();
        }
      });
      driveStream.data.on('end', () => res.end());
      driveStream.data.on('error', (err: any) => {
        console.error('[media:stream] pipe error', err);
        res.destroy(err);
      });
    } else {
      driveStream.data.pipe(res);
    }
  } catch (e: any) {
    console.error('[media:stream] error', e?.response?.data ?? e);
    res.status(404).json({ ok: false, message: 'Not found' });
  }
});

export default router;
