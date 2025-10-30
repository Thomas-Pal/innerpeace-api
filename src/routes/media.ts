import { Router } from 'express';
import { driveClient } from '../lib/drive.js';
import { requireSupabaseAuth } from '../middleware/auth.js';

const router = Router();

function buildAudioQuery(folderId: string) {
  const audioPred =
    "(mimeType contains 'audio/' or mimeType='audio/mpeg' or mimeType='audio/mp4' or mimeType='audio/x-m4a' or mimeType='audio/wav')";
  return `'${folderId}' in parents and trashed = false and ${audioPred}`;
}

router.get('/list', requireSupabaseAuth, async (req, res) => {
  const folderId = (req.query.folderId as string) || '1dQYrV3DFjJJB53Gn2ueN2tPY804dHCZm';
  const pageToken = (req.query.pageToken as string) || undefined;
  const pageSize = Math.min(parseInt((req.query.pageSize as string) || '50', 10), 200);

  try {
    const drive = driveClient();
    const { data } = await drive.files.list({
      q: buildAudioQuery(folderId),
      fields:
        'nextPageToken, files(id, name, mimeType, size, md5Checksum, modifiedTime, createdTime, iconLink, thumbnailLink)',
      orderBy: 'modifiedTime desc',
      pageToken,
      pageSize,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    });

    const items = (data.files || []).map((f) => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType!,
      size: f.size ? Number(f.size) : undefined,
      md5: f.md5Checksum,
      modifiedTime: f.modifiedTime,
      createdTime: f.createdTime,
      streamUrl: `/api/media/stream/${f.id}`,
      icon: f.iconLink,
      thumb: f.thumbnailLink,
    }));

    res.set('Cache-Control', 'public, max-age=60');
    res.json({ items, nextPageToken: data.nextPageToken || null });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[media.list] error', e?.response?.data || e);
    res.status(500).json({ code: 500, message: 'Drive list failed' });
  }
});

router.get('/stream/:id', requireSupabaseAuth, async (req, res) => {
  const fileId = req.params.id;
  const range = req.headers.range as string | undefined;

  try {
    const drive = driveClient();
    const meta = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size, md5Checksum, modifiedTime',
      supportsAllDrives: true,
    });
    const size = meta.data.size ? Number(meta.data.size) : undefined;
    const mime = meta.data.mimeType || 'application/octet-stream';

    // Range
    if (range && size) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : Math.min(start + 2 * 1024 * 1024, size - 1); // 2MB
      res.status(206).set({
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
        'Cache-Control': 'public, max-age=3600',
        ETag: meta.data.md5Checksum || meta.data.modifiedTime || meta.data.id!,
      });

      const driveResp = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream', headers: { Range: `bytes=${start}-${end}` } }
      );
      return driveResp.data.pipe(res);
    }

    // Full
    res.set({
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      ETag: meta.data.md5Checksum || meta.data.modifiedTime || meta.data.id!,
      ...(size ? { 'Content-Length': String(size) } : {}),
    });

    const driveResp = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );
    return driveResp.data.pipe(res);
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[media.stream] error', e?.response?.data || e);
    const status = e?.code === 416 ? 416 : 500;
    return res.status(status).json({ code: status, message: 'Drive stream failed' });
  }
});

export default router;
