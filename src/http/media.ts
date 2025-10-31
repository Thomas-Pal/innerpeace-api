import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { extractBearerToken, verifySupabaseJwt } from '../lib/supabaseJwt.js';
import { listDriveMedia } from '../services/drive.js';

export async function listMediaHandler(req: Request, res: Response) {
  const folderId =
    (req.query.folderId as string) ||
    process.env.MEDIA_FOLDER_ID ||
    process.env.DRIVE_MEDIA_FOLDER_ID;
  const pageToken = (req.query.pageToken as string) || undefined;
  const pageSizeRaw = (req.query.pageSize as string) || undefined;
  const parsedPageSize = pageSizeRaw ? Number.parseInt(pageSizeRaw, 10) : 50;
  const pageSize = Math.min(Math.max(Number.isFinite(parsedPageSize) ? parsedPageSize : 50, 1), 200);

  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
  }

  try {
    verifySupabaseJwt(token);
  } catch (error) {
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
  }

  if (!folderId) {
    return res.status(400).json({ code: 400, message: 'folderId required' });
  }

  try {
    const { files, nextPageToken } = await listDriveMedia(folderId, { pageToken, pageSize });
    const items = files.map((file) => ({
      id: file.id!,
      name: file.name ?? '',
      mimeType: file.mimeType ?? 'application/octet-stream',
      size: file.size ? Number(file.size) : undefined,
      md5: file.md5Checksum ?? null,
      modifiedTime: file.modifiedTime ?? null,
      createdTime: file.createdTime ?? null,
      streamUrl: `/api/media/stream/${file.id}`,
      icon: file.iconLink ?? null,
      thumb: file.thumbnailLink ?? null,
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

    return res.json({ items, nextPageToken });
  } catch (error) {
    console.error('[media.list] error', (error as any)?.response?.data || error);
    return res.status(500).json({ code: 500, message: 'Drive list failed' });
  }
}
