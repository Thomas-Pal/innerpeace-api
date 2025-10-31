import { Router } from 'express';
import { requireUser } from '../middleware/requireUser.js';
import { getDrive } from '../google/drive.js';
import { badRequest } from '../utils/http.js';

const r = Router();

r.get('/api/media/list', requireUser, async (req, res) => {
  try {
    const folderId =
      (req.query.folderId as string) ||
      process.env.MEDIA_FOLDER_ID ||
      process.env.DRIVE_MEDIA_FOLDER_ID;

    if (!folderId) return badRequest(res, 'folderId required');

    const drive = await getDrive();
    const resp = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink)',
      pageSize: Number(req.query.pageSize ?? 50),
      orderBy: 'modifiedTime desc',
    });

    return res.json({ files: resp.data.files ?? [] });
  } catch (e: any) {
    console.error('[media.list] error', e?.message || e);
    return res.status(500).json({ code: 500, message: 'Drive list failed' });
  }
});

export default r;
