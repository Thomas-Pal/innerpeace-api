import type express from 'express';

export type Authed = { idJwt: string; userId?: string };

export function requireAuth(req: express.Request): Authed {
  const idJwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const userId = (req.headers['x-user-id'] as string | undefined) || undefined;
  if (!idJwt) {
    const err: any = new Error('Missing ID token');
    err.status = 401;
    throw err;
  }
  return { idJwt, userId };
}
