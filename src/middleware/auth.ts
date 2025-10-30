import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL environment variable must be configured.');
}

const ISSUER = `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
const JWKS_URL = process.env.SUPABASE_JWKS_URL || `${ISSUER}/.well-known/jwks.json`;

const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

export interface AuthedRequest extends Request {
  auth?: { sub: string; user: JWTPayload };
}

export async function verifyBearer(token?: string) {
  if (!token) throw new Error('Missing bearer token');
  const { payload } = await jwtVerify(token.replace(/^Bearer\s+/i, ''), JWKS, {
    issuer: ISSUER,
  });
  return payload;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authz = req.headers.authorization;
    const payload = await verifyBearer(authz);
    (req as AuthedRequest).auth = { sub: String(payload.sub), user: payload };
    return next();
  } catch (e: any) {
    return res.status(401).json({ error: 'unauthorized', detail: e?.message });
  }
}
