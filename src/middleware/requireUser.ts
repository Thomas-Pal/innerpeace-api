import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../supabase/admin.js';

function bearer(req: Request) {
  const h = (req.headers.authorization || req.headers.Authorization) as string | undefined;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] ?? null;
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!supabaseAdmin) return res.status(401).json({ code: 401, message: 'Unauthorized' });
  const token = bearer(req);
  if (!token) return res.status(401).json({ code: 401, message: 'Unauthorized' });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ code: 401, message: 'Unauthorized' });

  (req as any).user = data.user;
  return next();
}
