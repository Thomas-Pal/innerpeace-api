import type { Request, RequestHandler } from 'express';
import type { JWTPayload } from 'jose';
import { verifyAppJwt } from '../utils/appJwt.js';
import { readAppJwtWithSource } from '../utils/readAppJwt.js';

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

async function resolveAppJwt(token: string): Promise<AppJwtAuthContext> {
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

function logJwtTrace(req: Request, source: string | null, token: string | null) {
  const entry = {
    source,
    hasToken: Boolean(token),
    tokenSuffix: token ? token.slice(-6) : null,
    path: req.originalUrl || req.path,
    method: req.method,
  };
  console.log('[appjwt]', entry);
}

export const maybeAppJwt: RequestHandler = async (req, _res, next) => {
  const { token, source } = readAppJwtWithSource(req);
  logJwtTrace(req, source, token);

  if (!token) {
    req.auth = null;
    ensureContext(req);
    return next();
  }

  try {
    req.auth = await resolveAppJwt(token);
  } catch (error) {
    console.warn('[appJwt] failed to verify token', error);
    req.auth = null;
  }

  ensureContext(req);
  return next();
};

export const requireAppJwt: RequestHandler = async (req, res, next) => {
  const { token, source } = readAppJwtWithSource(req);
  logJwtTrace(req, source, token);

  if (!token) {
    req.auth = null;
    ensureContext(req);
    return res.status(401).json({ code: 401, message: 'Jwt is missing' });
  }

  try {
    req.auth = await resolveAppJwt(token);
    ensureContext(req);
    return next();
  } catch (error) {
    console.error('[appJwt] token verification failed', error);
    req.auth = null;
    ensureContext(req);
    return res.status(401).json({ code: 401, message: 'Invalid JWT' });
  }
};
