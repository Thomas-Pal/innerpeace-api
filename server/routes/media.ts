import type { Request, Response } from 'express';
import { driveClientFromADC } from '../utils/googleClient.js';

const DEFAULT_ALLOWED = ['video/*', 'audio/*'];

type MediaItem = {
  id: string;
  name: string | null;
  mimeType: string;
  size?: number;
  modifiedTime?: string | null;
};

function isAllowed(mimeType: string, allowed: string[]): boolean {
  if (!mimeType) return false;
  return allowed.some((a) =>
    a.endsWith('/*') ? mimeType.startsWith(a.slice(0, -1)) : mimeType === a,
  );
}

export async function listMedia(req: Request, res: Response) {
  try {
    const drive = await driveClientFromADC();
    const folderId = (req.query.folderId as string) || process.env.DRIVE_FOLDER_ID;
    if (!folderId) return res.status(400).json({ error: 'folderId_required' });

    const allowedCsv = process.env.MEDIA_ALLOWED_MIME || '';
    const allowed = allowedCsv
      ? allowedCsv.split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULT_ALLOWED;

    const files: MediaItem[] = [];
    let pageToken: string | undefined;

    do {
      const { data } = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime)',
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,                  // ✅ important
        includeItemsFromAllDrives: true,          // ✅ important
      });
      for (const f of data.files ?? []) {
        if (!f.id || !f.mimeType) continue;
        if (!isAllowed(f.mimeType, allowed)) continue;
        files.push({
          id: f.id,
          name: f.name ?? null,
          mimeType: f.mimeType,
          size: f.size ? Number(f.size) : undefined,
          modifiedTime: f.modifiedTime ?? null,
        });
      }
      pageToken = data.nextPageToken || undefined;
    } while (pageToken);

    return res.json({ items: files });
  } catch (err) {
    console.error('[media:list] failed', err);
    return res.status(500).json({ error: 'media_list_failed' });
  }
}

export async function streamMedia(req: Request, res: Response) {
  try {
    const fileId = req.params.id;
    if (!fileId) return res.status(400).json({ error: 'file_id_required' });

    const drive = await driveClientFromADC();

    // Trace
    const range = req.headers.range as string | undefined;
    console.log('[media:stream] fileId=%s range=%s', fileId, range ?? 'none');

    // Metadata (so we can compute Content-Range)
    const { data: meta } = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size',
      supportsAllDrives: true,                  // ✅
    });
    const mime = meta.mimeType || 'application/octet-stream';
    const size = meta.size ? Number(meta.size) : undefined;

    if (range && size !== undefined) {
      const m = /bytes=(\d+)-(\d+)?/.exec(range);
      const start = m ? Number(m[1]) : 0;
      const end = m && m[2] ? Number(m[2]) : size - 1;
      if (start >= size || end >= size || end < start) {
        res.status(416).set('Content-Range', `bytes */${size}`).end();
        return;
      }
      const chunkSize = end - start + 1;

      const resp = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },       // ✅
        { responseType: 'stream', headers: { Range: `bytes=${start}-${end}` } },
      );

      res.status(206).set({
        'Content-Type': mime,
        'Content-Length': String(chunkSize),
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Disposition': `inline; filename="${(meta.name || 'file')}"`, // ✅
        'Cache-Control': process.env.MEDIA_CACHE_MAX_AGE || 'public, max-age=3600',
      });

      resp.data.on('error', (e: any) => {
        console.error('[media:stream] stream error', e);
        if (!res.headersSent) res.status(500).end();
      });
      resp.data.pipe(res);
      return;
    }

    // Full-body (no Range)
    const resp = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },         // ✅
      { responseType: 'stream' },
    );

    res.status(200).set({
      'Content-Type': mime,
      ...(size ? { 'Content-Length': String(size) } : {}),
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `inline; filename="${(meta.name || 'file')}"`,   // ✅
      'Cache-Control': process.env.MEDIA_CACHE_MAX_AGE || 'public, max-age=3600',
    });

    resp.data.on('error', (e: any) => {
      console.error('[media:stream] stream error', e);
      if (!res.headersSent) res.status(500).end();
    });
    resp.data.pipe(res);
  } catch (err) {
    console.error('[media:stream] failed', err);
    return res.status(500).json({ error: 'media_stream_failed' });
  }
}
