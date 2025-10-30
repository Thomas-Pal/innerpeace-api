import type { Request, Response, NextFunction } from 'express';
import { createSecretKey } from 'crypto';
import { jwtVerify, decodeProtectedHeader } from 'jose';

const REQUIRED_ALG = 'HS256';

const {
  SUPABASE_JWT_SECRET,
  SUPABASE_ISSUER,
  SUPABASE_AUD = 'authenticated',
} = process.env;

if (!SUPABASE_JWT_SECRET) {
  console.error('FATAL: SUPABASE_JWT_SECRET missing');
  // Fail fast in prod; ok to keep running in local if you want.
}

const secretKey = SUPABASE_JWT_SECRET
  ? createSecretKey(Buffer.from(SUPABASE_JWT_SECRET, 'utf8'))
  : undefined;

// Public paths (no auth)
const PUBLIC_PREFIXES = ['/healthz', '/youtube', '/api/youtube'];

export async function requireSupabaseAuth(req: Request, res: Response, next: NextFunction) {
  // Allow public routes
  if (PUBLIC_PREFIXES.some((p) => req.path.startsWith(p))) return next();

  // Everything else requires HS256 Supabase access_token
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) {
    return res.status(401).json({ code: 401, message: 'Unauthorized', hint: 'Missing Bearer token' });
  }

  let alg: string | undefined;
  try {
    ({ alg } = decodeProtectedHeader(token));
  } catch (error: any) {
    return res.status(401).json({ code: 401, message: 'Unauthorized', hint: error?.message || 'Invalid token header' });
  }

  if (alg !== REQUIRED_ALG) {
    return res.status(401).json({
      code: 401,
      message: 'Unauthorized',
      hint: `Expected Supabase access_token (${REQUIRED_ALG}) but received ${alg}. Ensure client sends supabase.session.access_token.`,
    });
  }

  if (!secretKey) {
    return res.status(500).json({ code: 500, message: 'Server auth misconfigured: SUPABASE_JWT_SECRET missing' });
  }

  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: [REQUIRED_ALG],
      issuer: SUPABASE_ISSUER || undefined,
      audience: SUPABASE_AUD,
    });

    req.user = {
      sub: typeof payload.sub === 'string' ? payload.sub : undefined,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      role: typeof payload.role === 'string' ? payload.role : undefined,
      aud: typeof payload.aud === 'string' ? payload.aud : undefined,
      iss: typeof payload.iss === 'string' ? payload.iss : undefined,
      exp: typeof payload.exp === 'number' ? payload.exp : undefined,
    };

    return next();
  } catch (e: any) {
    return res.status(401).json({ code: 401, message: 'Unauthorized', hint: e?.message || 'Invalid token' });
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
