import type { Request } from 'express';
import type { User } from '@supabase/supabase-js';

export { requireUser as requireSupabaseAuth } from '../../src/middleware/requireUser.js';

export function ensureUser(req: Request): User {
  const user = req.user;
  if (!user || typeof user !== 'object') {
    const error: any = new Error('Missing authenticated user');
    error.status = 401;
    throw error;
  }
  return user as User;
}

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Request {
      user?: User;
    }
  }
}
