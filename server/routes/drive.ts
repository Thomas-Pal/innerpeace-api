import { Router } from 'express';
import type { drive_v3 } from 'googleapis';
import { getDrive } from '../drive/driveClient.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const DEFAULT_FOLDER = process.env.DRIVE_DEFAULT_FOLDER_ID || '';
const parsedCacheSeconds = Number(process.env.DRIVE_LIST_CACHE_SECONDS || '300');
const LIST_CACHE_SECONDS = Number.isFinite(parsedCacheSeconds) && parsedCacheSeconds >= 0 ? parsedCacheSeconds : 300;

type DriveListItem = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  description: string | null;
  modifiedTime: string | null;
  thumbnail: string | null;
  streamUrlPath: string;
};

type DriveListPayload = { ok: true; items: DriveListItem[] };

type CacheEntry = { ts: number; data: DriveListPayload };
const listCache = new Map<string, CacheEntry>();

router.get('/list', async (req, res) => {
  try {
    requireAuth(req);

    const folderId = String(req.query.folderId || DEFAULT_FOLDER);
    if (!folderId) {
      return res.status(400).json({ ok: false, error: 'missing_folder_id' });
    }

    const cacheKey = `list:${folderId}`;
    const now = Date.now();
    const cached = listCache.get(cacheKey);
    if (cached && now - cached.ts < LIST_CACHE_SECONDS * 1000) {
      res.set('Cache-Control', `public, max-age=${LIST_CACHE_SECONDS}`);
      return res.json(cached.data);
    }

    const drive = getDrive();
    const files: drive_v3.Schema$File[] = [];
    let pageToken: string | undefined;

    do {
      const resp = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields:
          'nextPageToken, files(id, name, mimeType, size, description, modifiedTime, thumbnailLink)',
        orderBy: 'modifiedTime desc',
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      files.push(...((resp.data.files || []) as drive_v3.Schema$File[]));
      pageToken = resp.data.nextPageToken || undefined;
    } while (pageToken);

    const payload: DriveListPayload = {
      ok: true,
      items: files.map((file) => ({
        id: file.id!,
        name: file.name || 'Untitled',
        mimeType: file.mimeType || 'application/octet-stream',
        size: file.size ? Number(file.size) : null,
        description: file.description || null,
        modifiedTime: file.modifiedTime || null,
        thumbnail: file.thumbnailLink || null,
        streamUrlPath: `/api/drive/stream/${file.id}`,
      })),
    };

    listCache.set(cacheKey, { ts: now, data: payload });

    res.set('Cache-Control', `public, max-age=${LIST_CACHE_SECONDS}`);
    return res.json(payload);
  } catch (error) {
    console.error('drive_list_failed', (error as any)?.message || error);
    const status = (error as any)?.status || (error as any)?.response?.status || 500;
    return res.status(status).json({ ok: false, error: 'drive_list_failed' });
  }
});

router.get('/stream/:id', async (req, res) => {
  try {
    requireAuth(req);

    const id = String(req.params.id || '');
    if (!id) {
      return res.status(400).json({ ok: false, error: 'missing_file_id' });
    }

    const drive = getDrive();
    const metaResp = await drive.files.get({
      fileId: id,
      fields: 'id, name, mimeType, size',
      supportsAllDrives: true,
    });

    const meta = metaResp.data;
    const totalSize = meta.size ? Number(meta.size) : undefined;
    const mimeType = meta.mimeType || 'application/octet-stream';
    const filename = meta.name || 'file';

    const range = req.headers.range as string | undefined;

    if (range && totalSize !== undefined) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      const start = match ? Number(match[1]) : 0;
      const end = match && match[2] ? Number(match[2]) : totalSize - 1;
      const chunkSize = end - start + 1;

      const media = await drive.files.get(
        {
          fileId: id,
          alt: 'media',
          supportsAllDrives: true,
        },
        {
          responseType: 'stream',
          headers: { Range: `bytes=${start}-${end}` },
        }
      );

      res.status(206);
      res.set({
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
        'Cache-Control': 'public, max-age=3600',
      });

      media.data.on('error', (err: unknown) => {
        console.error('drive_stream_range_error', (err as any)?.message || err);
        res.destroy(err as Error);
      });

      media.data.pipe(res);
      return;
    }

    const media = await drive.files.get(
      {
        fileId: id,
        alt: 'media',
        supportsAllDrives: true,
      },
      { responseType: 'stream' }
    );

    if (totalSize !== undefined) {
      res.set('Content-Length', String(totalSize));
    }

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'public, max-age=3600',
    });

    media.data.on('error', (err: unknown) => {
      console.error('drive_stream_error', (err as any)?.message || err);
      res.destroy(err as Error);
    });

    media.data.pipe(res);
  } catch (error) {
    console.error('drive_stream_failed', (error as any)?.message || error);
    const status = (error as any)?.status || (error as any)?.response?.status || 500;
    if (!res.headersSent) {
      return res.status(status).json({ ok: false, error: 'drive_stream_failed' });
    }
    res.destroy(error as Error);
  }
});

export default router;
