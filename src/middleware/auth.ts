import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;

export function requireSupabaseAuth(req: Request, res: Response, next: NextFunction) {
  const b =
    req.header('X-Forwarded-Authorization') ||
    req.header('x-forwarded-authorization') ||
    req.header('Authorization') ||
    req.header('authorization');
  if (!b?.startsWith('Bearer ')) return res.status(401).json({ code: 401, message: 'Unauthorized' });
  const token = b.slice(7);
  try {
    jwt.verify(token, SUPABASE_JWT_SECRET, { algorithms: ['HS256'] });
    (req as any).user = jwt.decode(token);
    return next();
  } catch {
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
  }
}
