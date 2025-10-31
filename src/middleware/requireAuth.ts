import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

function extractBearer(req: Request) {
  const h1 = req.headers['authorization'];
  const h2 = req.headers['x-supabase-auth'];
  const raw = (Array.isArray(h1) ? h1[0] : h1) || (Array.isArray(h2) ? h2[0] : h2) || '';
  const m = raw.match(/Bearer\s+(.+)/i);
  return m?.[1] ?? null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractBearer(req);
    if (!token) return res.status(401).json({ code: 401, message: 'Unauthorized' });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ code: 401, message: 'Unauthorized' });
    }

    (req as any).user = data.user;
    return next();
  } catch (e) {
    console.error('[auth] error', e);
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
  }
}
