import { Router } from 'express';
import { authHandler } from '../middleware/auth.js';
import { requireAppJwt } from '../middleware/appJwt.js';
import { driveClientFromRequest } from '../utils/googleClient.js';

const DEFAULT_ALLOWED = ['video/*', 'audio/*'];

function isAllowed(mimeType: string | undefined | null, allowed: string[]): boolean {
  if (!mimeType) return false;
  return allowed.some((pattern) =>
    pattern.endsWith('/*') ? mimeType.startsWith(pattern.slice(0, -1)) : mimeType === pattern,
  );
}

const router = Router();

router.get('/list', requireAppJwt, authHandler, async (req, res) => {
  try {
    const folderId = String(
      req.query.folderId || process.env.DRIVE_MEDIA_FOLDER_ID || process.env.DRIVE_PARENT_FOLDER_ID || '',
    );
    if (!folderId) return res.status(400).json({ message: 'folderId is required' });

    const allowedCsv = process.env.MEDIA_ALLOWED_MIME || '';
    const allowed = allowedCsv
      ? allowedCsv.split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULT_ALLOWED;

    const drive = await driveClientFromRequest(req);
    const filesResponse = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,webViewLink,webContentLink,thumbnailLink,size,createdTime)',
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    });

    const files = (filesResponse.data.files ?? []).filter((file) =>
      isAllowed(file.mimeType, allowed),
    );

    res.json({ files, items: files });
  } catch (e: any) {
    if (e?.code === 403) {
      return res.status(403).json({
        message:
          'Service account lacks access to this folder/drive. Ensure the SA is a Viewer on the folder (or a member of the Shared drive).',
      });
    }
    console.error('[media:list] failed', e);
    res.status(500).json({ message: 'Failed to load media' });
  }
});

router.get('/stream/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    if (!fileId) return res.status(400).json({ error: 'file_id_required' });

    const drive = await driveClientFromRequest(req);

    const range = req.headers.range as string | undefined;
    console.log('[media:stream] fileId=%s range=%s', fileId, range ?? 'none');

    const { data: meta } = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size',
      supportsAllDrives: true,
    });
    const mime = meta.mimeType || 'application/octet-stream';
    const size = meta.size ? Number(meta.size) : undefined;

    if (range && size !== undefined) {
      const match = /bytes=(\d+)-(\d+)?/.exec(range);
      const start = match ? Number(match[1]) : 0;
      const end = match && match[2] ? Number(match[2]) : size - 1;
      if (start >= size || end >= size || end < start) {
        res.status(416).set('Content-Range', `bytes */${size}`).end();
        return;
      }
      const chunkSize = end - start + 1;

      const resp = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream', headers: { Range: `bytes=${start}-${end}` } },
      );

      res.status(206).set({
        'Content-Type': mime,
        'Content-Length': String(chunkSize),
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Disposition': `inline; filename="${meta.name || 'file'}"`,
        'Cache-Control': process.env.MEDIA_CACHE_MAX_AGE || 'public, max-age=3600',
      });

      resp.data.on('error', (error: any) => {
        console.error('[media:stream] stream error', error);
        if (!res.headersSent) res.status(500).end();
      });
      resp.data.pipe(res);
      return;
    }

    const resp = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });

    res.status(200).set({
      'Content-Type': mime,
      ...(size ? { 'Content-Length': String(size) } : {}),
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `inline; filename="${meta.name || 'file'}"`,
      'Cache-Control': process.env.MEDIA_CACHE_MAX_AGE || 'public, max-age=3600',
    });

    resp.data.on('error', (error: any) => {
      console.error('[media:stream] stream error', error);
      if (!res.headersSent) res.status(500).end();
    });
    resp.data.pipe(res);
  } catch (e) {
    console.error('[media:stream] failed', e);
    res.status(500).json({ error: 'media_stream_failed' });
  }
});

export default router;
