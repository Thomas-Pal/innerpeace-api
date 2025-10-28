import { Router } from 'express';
import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';
import { maybeAppJwt } from '../middleware/appJwt.js';

const router = Router();

router.get('/channel/:channelId', maybeAppJwt, async (req, res) => {
  try {
    const { channelId } = req.params;
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
    const xml = await (await fetch(url)).text();
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    res.json(parsed.feed || { entries: [] });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'youtube proxy failed' });
  }
});

export default router;
