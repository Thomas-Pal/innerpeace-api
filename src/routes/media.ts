import { Router } from 'express';
import crypto from 'crypto';
import type { drive_v3 } from 'googleapis';
import { signStreamToken, verifyStreamToken } from '../lib/streamToken.js';
import { requireSupabaseAuth } from '../middleware/auth.js';
import { driveClient } from '../lib/drive.js';

type MediaItem = {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  md5?: string | null;
  modifiedTime?: string | null;
  createdTime?: string | null;
  streamUrl: string;
  icon?: string | null;
  thumb?: string | null;
};

const router = Router();

router.get('/list', requireSupabaseAuth, async (req, res) => {
  const folderId = req.query.folderId as string;
  const pageToken = (req.query.pageToken as string) || undefined;
  const pageSize = Math.min(parseInt((req.query.pageSize as string) || '50', 10), 200);
  if (!folderId) return res.status(400).json({ code: 400, message: 'Missing folderId' });

  try {
    const drive = driveClient();
    const { data } = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and (mimeType contains 'audio/' or mimeType='audio/mpeg' or mimeType='audio/mp4' or mimeType='audio/x-m4a' or mimeType='audio/wav')`,
      fields: 'nextPageToken, files(id,name,mimeType,size,md5Checksum,modifiedTime,createdTime,iconLink,thumbnailLink)',
      orderBy: 'modifiedTime desc',
      pageToken,
      pageSize,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    });

    const items: MediaItem[] = (data.files || []).map((file: drive_v3.Schema$File) => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      size: file.size ? Number(file.size) : undefined,
      md5: file.md5Checksum,
      modifiedTime: file.modifiedTime,
      createdTime: file.createdTime,
      streamUrl: `/api/media/stream/${file.id}`,
      icon: file.iconLink,
      thumb: file.thumbnailLink,
    }));

    console.log('[BE]/api/media/list', {
      folderId,
      count: items.length,
      sample: items.slice(0, 3).map(({ id, name }) => ({ id, name })),
    });

    const etag = crypto
      .createHash('sha1')
      .update(items.map((i) => `${i.id}:${i.md5 ?? ''}:${i.modifiedTime ?? ''}`).join('|'))
      .digest('hex');
    const noStore = process.env.MEDIA_LIST_NO_STORE === 'true';
    res.set(
      noStore
        ? { 'Cache-Control': 'no-store' }
        : { 'Cache-Control': 'public, max-age=60', ETag: `"media-list-${etag}"` }
    );

    return res.json({ items, nextPageToken: data.nextPageToken || null });
  } catch (e: any) {
    console.error('[media.list] error', e?.response?.data || e);
    return res.status(500).json({ code: 500, message: 'Drive list failed' });
  }
});

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
    const b = req.header('X-Forwarded-Authorization') || req.header('Authorization') || '';
    if (!b.startsWith('Bearer ')) return res.status(401).json({ code: 401, message: 'Unauthorized' });
    allowed = true;
  }
  const drive = driveClient();
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
