import type { Request, Response, NextFunction } from 'express';
import { jwtVerify } from 'jose';

// Build issuer like: https://<ref>.supabase.co/auth/v1
function expectedIssuer(): string {
  const fromEnv = process.env.SUPABASE_ISSUER;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!ref) throw new Error('SUPABASE_PROJECT_REF or SUPABASE_ISSUER is required');
  return `https://${ref}.supabase.co/auth/v1`;
}
const AUD = process.env.SUPABASE_AUD || 'authenticated';

export async function requireSupabaseAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.header('authorization') || req.header('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ code: 401, message: 'Missing Bearer token' });
    }
    const token = auth.slice('Bearer '.length).trim();

    // HS256 verification: use SUPABASE_JWT_SECRET
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ code: 500, message: 'Server auth misconfigured: SUPABASE_JWT_SECRET missing' });
    }

    const iss = expectedIssuer();
    const encoder = new TextEncoder();
    const key = encoder.encode(secret);

    const { payload } = await jwtVerify(token, key, { issuer: iss, audience: AUD });

    // Attach minimal user to request (extend as needed)
    req.user = {
      sub: payload.sub,
      email: (payload as any).email,
      role: (payload as any).role,
      aud: payload.aud as string,
      iss: payload.iss as string,
      exp: payload.exp as number,
    };
    return next();
  } catch (err: any) {
    return res.status(401).json({ code: 401, message: 'Unauthorized', hint: err?.message || 'invalid token' });
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

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub?: string;
        email?: string;
        role?: string;
        aud?: string;
        iss?: string;
        exp?: number;
      };
    }
  }
}
