import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { requireAuth, AuthedRequest } from './middleware/auth.js';
import { listFilesInFolder } from './google/drive.js';

const PORT = process.env.PORT || 8080;
const MEDIA_FOLDER_ID = process.env.GOOGLE_DRIVE_SHARED_FOLDER_ID || process.env.MEDIA_FOLDER_ID;

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(morgan('tiny'));

app.get('/healthz', (_req, res) => res.send('ok'));

app.get('/api/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.auth?.user });
});

app.get('/api/media/list', requireAuth, async (req, res) => {
  try {
    const folderId = String(req.query.folderId || MEDIA_FOLDER_ID || '');
    if (!folderId) return res.status(400).json({ error: 'missing folderId' });
    const files = await listFilesInFolder(folderId);
    res.json({ files });
  } catch (e: any) {
    res.status(500).json({ error: 'drive_list_failed', detail: e?.message });
  }
});

app.listen(PORT, () => console.log(`api listening on :${PORT}`));
