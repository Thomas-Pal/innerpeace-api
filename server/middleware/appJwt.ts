import type { Request, RequestHandler } from 'express';
import type { JWTPayload } from 'jose';
import { verifyAppJwt } from '../utils/appJwt.js';

export interface AppJwtAuthContext {
  token: string;
  userId: string;
  roles: string[];
  claims: JWTPayload;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AppJwtAuthContext | null;
      ctx?: {
        provider?: string | null;
        idTokenSource?: 'google' | 'apple' | null;
      };
    }
  }
}

function extractBearer(headerValue?: string | null): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match ? match[1] : null;
}

function getAppJwtFromRequest(req: Request): string | null {
  const bearer = extractBearer(req.header('authorization'));
  if (bearer) {
    return bearer;
  }

  const headerValue = req.header('x-app-jwt');
  if (!headerValue) {
    return null;
  }

  const trimmed = headerValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRoles(claims: JWTPayload): string[] {
  const rawRoles = (claims as Record<string, unknown>).roles;
  if (Array.isArray(rawRoles)) {
    return rawRoles.filter((role): role is string => typeof role === 'string' && role.length > 0);
  }

  if (typeof rawRoles === 'string') {
    return rawRoles
      .split(',')
      .map((role) => role.trim())
      .filter((role) => role.length > 0);
  }

  return [];
}

function extractUserId(claims: JWTPayload): string {
  if (typeof claims.sub === 'string' && claims.sub) {
    return claims.sub;
  }

  const userId = (claims as Record<string, unknown>).userId;
  if (typeof userId === 'string' && userId) {
    return userId;
  }

  throw new Error('App JWT is missing a subject or userId claim');
}

async function resolveAppJwt(req: Request): Promise<AppJwtAuthContext | null> {
  const token = getAppJwtFromRequest(req);
  if (!token) {
    return null;
  }

  const claims = await verifyAppJwt(token);
  const userId = extractUserId(claims);
  const roles = normalizeRoles(claims);

  return {
    token,
    claims,
    userId,
    roles,
  };
}

function ensureContext(req: Request) {
  if (!req.ctx) {
    req.ctx = {};
  }
}

export const maybeAppJwt: RequestHandler = async (req, _res, next) => {
  try {
    const auth = await resolveAppJwt(req);
    req.auth = auth;
  } catch (error) {
    console.warn('[appJwt] failed to verify token', error);
    req.auth = null;
  } finally {
    ensureContext(req);
    next();
  }
};

export const requireAppJwt: RequestHandler = async (req, res, next) => {
  try {
    const existing = req.auth;
    if (existing) {
      ensureContext(req);
      next();
      return;
    }

    const auth = await resolveAppJwt(req);
    if (!auth) {
      ensureContext(req);
      res.status(401).json({ code: 401, message: 'Missing app token' });
      return;
    }

    req.auth = auth;
    ensureContext(req);
    next();
  } catch (error) {
    console.error('[appJwt] token verification failed', error);
    req.auth = null;
    ensureContext(req);
    res.status(401).json({ code: 401, message: 'Invalid app token' });
  }
};
