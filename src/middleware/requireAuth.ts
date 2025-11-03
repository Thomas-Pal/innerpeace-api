import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { logger, mask } from '../logging/logger.js';

const DEBUG_LOG_TOKENS = (process.env.DEBUG_LOG_TOKENS || 'false') === 'true';

function decodeJwtPayload(jwt?: string) {
  try {
    if (!jwt) return null;
    const [, payload] = jwt.split('.');
    if (!payload) return null;
    const json = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Prefer FE-provided header; fall back to Authorization ONLY if it's a Supabase token
export function pickSupabaseToken(req: Request): string | null {
  const xh = (req.headers['x-supabase-auth'] as string | undefined) || '';
  const xm = xh.match(/Bearer\s+(.+)/i);
  if (xm?.[1]) return xm[1].trim();

  const ah = (req.headers['authorization'] as string | undefined) || '';
  const am = ah.match(/Bearer\s+(.+)/i);
  const maybe = am?.[1]?.trim();
  if (!maybe) return null;

  const p = decodeJwtPayload(maybe);
  const iss = (p?.iss || '') as string;
  // Supabase JWTs have iss like: https://<ref>.supabase.co/auth/v1
  if (iss.includes('.supabase.co/auth/v1')) return maybe;

  // Otherwise it's probably the Google ID token injected by API Gateway -> ignore
  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const id = (req as any).correlationId;
  const authHeader = req.headers['authorization'] as string | undefined;
  const xSupabase = req.headers['x-supabase-auth'] as string | undefined;

  logger.info({
    tag: 'auth.headers',
    id,
    hasAuth: Boolean(authHeader),
    hasXSupabase: Boolean(xSupabase),
    authTail: mask(authHeader),
    xSupabaseTail: mask(xSupabase),
  });

  const token = pickSupabaseToken(req);

  if (!token) {
    logger.warn({ tag: 'auth.missing', id });
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      logger.warn({
        tag: 'auth.invalid',
        id,
        error: { name: (error as any)?.name, message: (error as any)?.message },
        token: DEBUG_LOG_TOKENS ? token : mask(token),
      });
      return res.status(401).json({ code: 401, message: 'Unauthorized' });
    }

    (req as any).user = data.user;

    logger.info({
      tag: 'auth.ok',
      id,
      userId: data.user.id,
      email: (data.user as any).email || null,
    });

    return next();
  } catch (e: any) {
    logger.error({ tag: 'auth.error', id, name: e?.name, message: e?.message });
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
  }
}
