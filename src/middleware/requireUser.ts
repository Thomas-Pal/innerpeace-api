import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../supabase/admin.js';

const HEADER_CANDIDATES = [
  'x-forwarded-authorization',
  'X-Forwarded-Authorization',
  'authorization',
  'Authorization',
] as const;

export function extractBearer(req: Request) {
  for (const header of HEADER_CANDIDATES) {
    const raw = req.headers[header as keyof typeof req.headers];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === 'string') {
      const match = /^Bearer\s+(.+)$/i.exec(value);
      if (match) return match[1];
    }
  }
  return null;
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractBearer(req);
    if (!token) {
      return res.status(401).json({ code: 401, message: 'Unauthorized' });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      // eslint-disable-next-line no-console
      console.warn('[auth] token rejected', { msg: error?.message });
      return res.status(401).json({ code: 401, message: 'Unauthorized' });
    }

    (req as Request & { user?: typeof data.user }).user = data.user;
    return next();
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error('[auth] unexpected', error?.message || error);
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
  }
}
