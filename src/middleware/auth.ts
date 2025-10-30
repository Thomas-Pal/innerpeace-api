import type { Request, Response, NextFunction } from 'express';
import { extractBearerToken, verifySupabaseJwt } from '../lib/supabaseJwt.js';

export function requireSupabaseAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
  }

  try {
    const payload = verifySupabaseJwt(token);
    (req as any).user = payload;
    return next();
  } catch {
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
  }
}
