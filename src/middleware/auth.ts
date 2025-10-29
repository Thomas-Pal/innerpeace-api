import type { NextFunction, Request, Response } from 'express';
import { readAppJwt } from '../auth/headers.js';
import { verifyAppJwt, type AuthClaims } from '../auth/jwt.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthClaims;
      ctx?: {
        provider?: string | null;
        idTokenSource?: 'google' | 'apple' | string | null;
      };
    }
  }
}

type VerifyFn = (token: string) => Promise<AuthClaims>;

export function createAuthMiddleware(deps?: { verify?: VerifyFn }) {
  const verifyFn = deps?.verify ?? verifyAppJwt;

  return async function requireAuth(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = readAppJwt(req);
      if (!token) {
        req.user = undefined;
        if (!req.ctx) req.ctx = {};
        return res.status(401).json({ code: 401, message: 'Missing JWT' });
      }

      const claims = await verifyFn(token);
      req.user = claims;
      if (!req.ctx) req.ctx = {};
      return next();
    } catch (error) {
      req.user = undefined;
      if (!req.ctx) req.ctx = {};
      return res.status(401).json({ code: 401, message: 'Invalid or expired JWT' });
    }
  };
}

export const requireAuth = createAuthMiddleware();
