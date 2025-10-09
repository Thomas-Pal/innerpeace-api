// server/routes/media.ts
import express, { type Request, type Response } from 'express';
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';

const router = express.Router();

// Drive constants
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

const auth = new GoogleAuth({ scopes: [DRIVE_SCOPE] });

/**
 * Fetch a readable stream from Google Drive for a fileId.
 * We forward the Range header verbatim so Drive handles 206/Content-Range for us.
 */
async function driveFetchStream(fileId: string, rangeHeader?: string) {
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  const url = `${DRIVE_API}/${encodeURIComponent(fileId)}?alt=media`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${typeof accessToken === 'string' ? accessToken : accessToken?.token ?? ''}`,
      ...(rangeHeader ? { Range: rangeHeader } : {}),
    },
  });

  return res;
}

/**
 * Fetch file metadata (size, mimeType, name, modifiedTime).
 * Useful for HEAD responses and debugging.
 */
async function driveGetMeta(fileId: string) {
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  const url = `${DRIVE_API}/${encodeURIComponent(fileId)}?fields=size,mimeType,name,modifiedTime,md5Checksum`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${typeof accessToken === 'string' ? accessToken : accessToken?.token ?? ''}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    const error = new Error(`Drive metadata fetch failed (${res.status}): ${text}`);
    (error as any).status = res.status;
    throw error;
  }
  return (await res.json()) as {
    size?: string;
    mimeType?: string;
    name?: string;
    modifiedTime?: string;
    md5Checksum?: string;
  };
}

/**
 * Copy a safe subset of upstream headers to the client.
 */
function passthroughHeaders(upstream: Headers, res: Response) {
  const hopByHop = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
  ]);

  upstream.forEach((value, key) => {
    const k = key.toLowerCase();
    if (!hopByHop.has(k)) {
      try {
        // Avoid setting multiple cache-control variants; we’ll set our own if missing
        if (k === 'cache-control') return;
        res.setHeader(key, value);
      } catch {
        // Some headers (like duplicate set-cookie) can be finicky; ignore safely
      }
    }
  });

  // Ensure sensible caching if upstream didn’t provide it
  if (!res.getHeader('Cache-Control')) {
    // 1 hour CDN/browser caching; tweak as needed
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
  // Help proxies to not buffer long streams
  res.setHeader('X-Accel-Buffering', 'no');
}

/**
 * GET /media/drive/:fileId
 * Streams a Google Drive file (audio/video) with Range support.
 */
router.get('/media/drive/:fileId', async (req: Request, res: Response) => {
  const { fileId } = req.params;

  if (!fileId) {
    res.status(400).json({ error: 'bad_request', message: 'fileId is required' });
    return;
  }

  try {
    const range = typeof req.headers.range === 'string' ? req.headers.range : undefined;
    const upstream = await driveFetchStream(fileId, range);

    // Allow 200 OK (full) and 206 Partial Content
    if (!(upstream.ok || upstream.status === 206)) {
      const text = await upstream.text().catch(() => '');
      res.status(upstream.status).send(text || 'Upstream error');
      return;
    }

    passthroughHeaders(upstream.headers as unknown as Headers, res);
    res.status(upstream.status);

    // Pipe body stream
    if (upstream.body) {
      // @ts-expect-error -- node-fetch body is a readable stream compatible with Express
      upstream.body.pipe(res);
      // If the client disconnects, abort the upstream
      req.on('close', () => {
        try {
          // @ts-expect-error node-fetch body has destroy()
          upstream.body.destroy?.();
        } catch {
          /* no-op */
        }
      });
    } else {
      res.end();
    }
  } catch (err: any) {
    console.error('[media] drive proxy failed', err);
    const status = err?.status ?? 500;
    res.status(status).json({
      error: 'drive_proxy_failed',
      message:
        err?.message ??
        'Failed to stream from Google Drive. Ensure the Cloud Run service account has access to this file.',
    });
  }
});

/**
 * HEAD /media/drive/:fileId
 * Returns length & type without streaming body (some players probe first).
 */
router.head('/media/drive/:fileId', async (req: Request, res: Response) => {
  const { fileId } = req.params;

  if (!fileId) {
    res.status(400).end();
    return;
  }

  try {
    const meta = await driveGetMeta(fileId);

    if (meta.mimeType) res.setHeader('Content-Type', meta.mimeType);
    if (meta.size) res.setHeader('Content-Length', meta.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).end();
  } catch (err: any) {
    console.error('[media] drive HEAD failed', err);
    res.status(err?.status ?? 500).end();
  }
});

export default router;
