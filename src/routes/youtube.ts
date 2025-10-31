import { Router } from 'express';
import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';

const r = Router();

/** Public proxy of the YouTube RSS feed for a channel */
r.get('/channel/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
    const xml = await (await fetch(url)).text();
    const parsed = await parseStringPromise(xml, { explicitArray: false });
    return res.json(parsed.feed || { entries: [] });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'youtube proxy failed' });
  }
});

export default r;
