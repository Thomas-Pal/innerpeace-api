import type { Request } from 'express';
import type { AuthClaims } from '../../src/auth/jwt.js';
export { requireAuth } from '../../src/middleware/auth.js';

export type AuthenticatedUser = AuthClaims;

export function requireUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    const error: any = new Error('Missing authenticated user');
    error.status = 401;
    throw error;
  }
  return req.user;
}
