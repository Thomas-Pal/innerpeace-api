import type { Request } from 'express';
import type { JwtPayload } from 'jsonwebtoken';

export { requireSupabaseAuth } from '../../src/middleware/auth.js';

export function requireUser(req: Request): JwtPayload {
  const user = req.user;
  if (!user || typeof user !== 'object') {
    const error: any = new Error('Missing authenticated user');
    error.status = 401;
    throw error;
  }
  return user as JwtPayload;
}

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Request {
      user?: JwtPayload;
    }
  }
}
