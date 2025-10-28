import type { Request } from 'express';

export type AppJwtHeaderSource = 'x-app-jwt' | 'x-forwarded-authorization' | 'authorization' | null;

export interface ReadAppJwtResult {
  token: string | null;
  source: AppJwtHeaderSource;
  suffix: string | null;
}

function pickHeaderValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    return value.find((entry): entry is string => typeof entry === 'string') ?? null;
  }
  return typeof value === 'string' ? value : null;
}

function headerValue(req: Request, name: string): string | null {
  const headers = req.headers;
  const direct = pickHeaderValue(headers[name] ?? headers[name.toLowerCase()]);
  if (direct) {
    return direct;
  }

  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      const match = pickHeaderValue(value);
      if (match) {
        return match;
      }
    }
  }

  return null;
}

function extractBearer(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  if (!match) {
    return null;
  }

  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

function suffixFor(token: string | null): string | null {
  if (!token) {
    return null;
  }
  const tail = token.slice(-6);
  return `…${tail}`;
}

export function readAppJwt(req: Request): ReadAppJwtResult {
  const xAppJwt = headerValue(req, 'x-app-jwt');
  if (xAppJwt) {
    const token = xAppJwt.trim();
    const normalized = token.length > 0 ? token : null;
    return {
      token: normalized,
      source: normalized ? 'x-app-jwt' : null,
      suffix: suffixFor(normalized),
    };
  }

  const forwarded = extractBearer(headerValue(req, 'x-forwarded-authorization'));
  if (forwarded) {
    return {
      token: forwarded,
      source: 'x-forwarded-authorization',
      suffix: suffixFor(forwarded),
    };
  }

  const auth = extractBearer(headerValue(req, 'authorization'));
  if (auth) {
    return {
      token: auth,
      source: 'authorization',
      suffix: suffixFor(auth),
    };
  }

  return { token: null, source: null, suffix: null };
}
