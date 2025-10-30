import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

if (!SUPABASE_JWT_SECRET) {
  // Fail fast at boot
  // eslint-disable-next-line no-console
  console.error('Missing SUPABASE_JWT_SECRET');
  process.exit(1);
}

/**
 * Accepts Supabase HS256 tokens.
 * If behind API Gateway with backend JWT enabled, ESP moves the client token to `X-Forwarded-Authorization`.
 * We preferentially read that header; otherwise fall back to Authorization.
 */
export function requireSupabaseAuth(req: Request, res: Response, next: NextFunction) {
  const bearer =
    req.header('X-Forwarded-Authorization') ||
    req.header('x-forwarded-authorization') ||
    req.header('Authorization') ||
    req.header('authorization');

  if (!bearer?.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: 'Unauthorized', hint: 'Missing Bearer token' });
  }

  const token = bearer.slice('Bearer '.length);

  try {
    // Force HS256 so we never accept Gateway’s RS256 token by accident
    const payload = jwt.verify(token, SUPABASE_JWT_SECRET!, { algorithms: ['HS256'] }) as JwtPayload;
    (req as any).user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({
      code: 401,
      message: 'Unauthorized',
      hint:
        'Expected Supabase access_token (HS256). If API Gateway injects a backend JWT, send the original token in X-Forwarded-Authorization.',
    });
  }
}
