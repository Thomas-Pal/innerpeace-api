// server/middleware/auth.ts
import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
if (!PROJECT_REF) {
  throw new Error('SUPABASE_PROJECT_REF is not configured');
}
const SUPABASE_ISS = `https://${PROJECT_REF}.supabase.co/auth/v1`;
const SUPABASE_JWKS = `${SUPABASE_ISS}/keys`;
const SUPABASE_AUD = process.env.SUPABASE_AUD || 'authenticated';

const jwks = createRemoteJWKSet(new URL(SUPABASE_JWKS));
const isLocal = process.env.NODE_ENV !== 'production';

declare global {
  namespace Express {
    interface Request {
      user?: Record<string, any>;
    }
  }
}

/**
 * Production (behind ESPv2):
 *  - ESP validates token and *may* forward x-endpoint-api-userinfo (base64 JSON of claims).
 * This middleware:
 * 1) Uses ESP userinfo if present,
 * 2) Verifies Authorization locally in dev,
 * 3) Otherwise 401.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // 1) Trust ESP user info header if present
    const userInfoB64 = req.header('x-endpoint-api-userinfo');
    if (userInfoB64) {
      const json = Buffer.from(userInfoB64, 'base64').toString('utf8');
      req.user = JSON.parse(json);
      return next();
    }

    // 2) Local/dev: verify bearer token against Supabase JWKS
    if (isLocal) {
      const auth = req.header('authorization') || req.header('Authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token) return res.status(401).json({ code: 401, message: 'Missing Authorization' });
      const { payload } = await jwtVerify(token, jwks, { issuer: SUPABASE_ISS, audience: SUPABASE_AUD });
      req.user = payload as any;
      return next();
    }

    // 3) In prod without ESP user info: deny (shouldn't happen)
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
  } catch {
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
  }
}

export function requireUser(req: Request) {
  if (!req.user) {
    const error: any = new Error('Missing authenticated user');
    error.status = 401;
    throw error;
  }
  return req.user;
}
