import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { JWTPayload } from 'jose';
import { readAppJwt } from '../auth/headers.js';
import { verifyAppJwt } from '../auth/verify.js';

export interface AppJwtAuthContext {
  token: string;
  userId: string;
  roles: string[];
  claims: JWTPayload;
}

type RequestLogger = {
  info?: (...args: unknown[]) => void;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AppJwtAuthContext | null;
      ctx?: {
        provider?: string | null;
        idTokenSource?: 'google' | 'apple' | null;
      };
      log?: RequestLogger;
    }
  }
}

function ensureContext(req: Request) {
  if (!req.ctx) {
    req.ctx = {};
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

function getLogger(req: Request) {
  const logger = req.log;
  if (logger && typeof logger.info === 'function') {
    return logger.info.bind(logger);
  }
  return console.info.bind(console);
}

function logJwtTrace(req: Request, source: string | null, hasToken: boolean, suffix: string | null) {
  const entry = {
    path: req.originalUrl || req.path,
    method: req.method,
    source,
    hasToken,
    suffix,
  };
  getLogger(req)(`[appjwt] ${JSON.stringify(entry)}`);
}

async function resolveAppJwt(token: string): Promise<AppJwtAuthContext> {
  const claims = await verifyAppJwt(token);
  const userId = extractUserId(claims);
  const roles = normalizeRoles(claims);

  return {
    token,
    userId,
    roles,
    claims,
  };
}

function handleVerificationError(req: Request, error: unknown) {
  // eslint-disable-next-line no-console
  console.warn('[appjwt] token verification failed', error);
  req.auth = null;
  ensureContext(req);
}

function createRequireHandler(options: { enforce: boolean }): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { token, source, suffix } = readAppJwt(req);
    logJwtTrace(req, source, Boolean(token), suffix);

    if (!token) {
      req.auth = null;
      ensureContext(req);
      if (options.enforce) {
        return res.status(401).json({ code: 401, message: 'Jwt is missing' });
      }
      return next();
    }

    try {
      req.auth = await resolveAppJwt(token);
      ensureContext(req);
      return next();
    } catch (error) {
      handleVerificationError(req, error);
      if (options.enforce) {
        return res.status(401).json({ code: 401, message: 'Invalid JWT' });
      }
      return next();
    }
  };
}

export function requireAppJwt(): RequestHandler {
  return createRequireHandler({ enforce: true });
}

export function maybeAppJwt(): RequestHandler {
  return createRequireHandler({ enforce: false });
}
