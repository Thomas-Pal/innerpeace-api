import type { NextFunction, Request, Response } from 'express';
import type { JWTPayload } from 'jose';
import {
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
} from 'jose';

export type Provider = 'google' | 'apple' | 'session';

export interface AuthenticatedUser {
  provider: Provider;
  uid: string;
  email: string | null;
  claims: JWTPayload;
  token: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      appJwt?: string | null;
    }
  }
}

const appleJWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const googleJWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const APPLE_ISSUER = 'https://appleid.apple.com';

const textEncoder = new TextEncoder();

function extractBearer(headerValue: string | undefined | null): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match ? match[1] : null;
}

function extractHeaderToken(headerValue: string | undefined | null): string | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (!trimmed) return null;
  const withoutBearer = trimmed.replace(/^Bearer\s+/i, '');
  return withoutBearer.replace(/^"+|"+$/g, '') || null;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding ? normalized + '='.repeat(4 - padding) : normalized;
  return Buffer.from(padded, 'base64').toString('utf8');
}

async function verifyApple(idToken: string) {
  const { payload } = await jwtVerify(idToken, appleJWKS, {
    issuer: APPLE_ISSUER,
    audience: process.env.APPLE_AUDIENCE_BUNDLE_ID,
    algorithms: ['RS256'],
  });
  return payload;
}

async function verifyGoogle(idToken: string) {
  const { payload } = await jwtVerify(idToken, googleJWKS, {
    issuer: GOOGLE_ISSUERS,
    audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
    algorithms: ['RS256'],
  });
  return payload;
}

async function verifySession(idToken: string) {
  const secret = process.env.SESSION_JWT_SECRET;
  if (!secret) {
    throw new Error('SESSION_JWT_SECRET is not configured');
  }
  const { payload } = await jwtVerify(idToken, textEncoder.encode(secret), {
    algorithms: ['HS256'],
  });
  return payload;
}

function normalizeSubject(payload: JWTPayload): string {
  const subject = (payload.sub ?? (payload as any).user_id ?? '').toString();
  if (!subject) {
    throw new Error('Token is missing subject');
  }
  return subject;
}

function detectProviderFromToken(token: string): Provider {
  const header = decodeProtectedHeader(token);
  if (header.alg && header.alg.toUpperCase().startsWith('HS')) {
    return 'session';
  }

  const payload = decodeJwt(token);
  const issuer = typeof payload.iss === 'string' ? payload.iss : '';
  if (GOOGLE_ISSUERS.includes(issuer)) {
    return 'google';
  }
  if (issuer === APPLE_ISSUER) {
    return 'apple';
  }
  throw new Error('Unknown token issuer');
}

export async function authHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const authorizationBearer = extractBearer(req.header('authorization'));
    const googleHeaderToken = extractHeaderToken(req.header('x-google-id-token'));
    const appleHeaderToken = extractHeaderToken(req.header('x-apple-identity-token'));

    const gatewayUserInfo = req.header('x-endpoint-api-userinfo');
    if (gatewayUserInfo) {
      try {
        const claims = JSON.parse(decodeBase64Url(gatewayUserInfo)) as JWTPayload;
        const issuer = typeof claims.iss === 'string' ? claims.iss : '';
        const provider: Provider = GOOGLE_ISSUERS.includes(issuer)
          ? 'google'
          : issuer === APPLE_ISSUER
          ? 'apple'
          : 'session';

        const uid = normalizeSubject(claims);
        const email = typeof claims.email === 'string' ? claims.email : null;

        req.user = {
          provider,
          uid,
          email,
          claims,
          token: provider === 'google' ? googleHeaderToken : provider === 'apple' ? appleHeaderToken : authorizationBearer,
        };
        req.appJwt = authorizationBearer;
        return next();
      } catch (err) {
        console.error('[auth] failed to parse X-Endpoint-API-UserInfo header', err);
      }
    }

    const providerHeader = (req.header('x-auth-provider') || '').toLowerCase();

    let provider: Provider | null = null;
    let token: string | null = null;

    if (providerHeader === 'apple') {
      provider = 'apple';
      token = appleHeaderToken || authorizationBearer;
    } else if (providerHeader === 'google') {
      provider = 'google';
      token = googleHeaderToken || authorizationBearer;
    } else if (providerHeader === 'session') {
      provider = 'session';
      token = authorizationBearer;
    } else if (appleHeaderToken) {
      provider = 'apple';
      token = appleHeaderToken;
    } else if (googleHeaderToken) {
      provider = 'google';
      token = googleHeaderToken;
    } else if (authorizationBearer) {
      provider = detectProviderFromToken(authorizationBearer);
      token = authorizationBearer;
    }

    if (!provider || !token) {
      return res.status(401).json({ message: 'Missing authentication token', code: 401 });
    }

    let payload: JWTPayload;
    if (provider === 'apple') {
      payload = await verifyApple(token);
    } else if (provider === 'google') {
      payload = await verifyGoogle(token);
    } else {
      payload = await verifySession(token);
    }

    const uid = normalizeSubject(payload);
    const email = typeof payload.email === 'string' ? payload.email : null;

    req.user = { provider, uid, email, claims: payload, token };
    req.appJwt = authorizationBearer;
    return next();
  } catch (error) {
    console.error('[auth] token verification failed', error);
    return res.status(401).json({ message: 'Invalid token', code: 401 });
  }
}

export function requireAuth(req: Request): AuthenticatedUser {
  if (!req.user) {
    const err: any = new Error('Missing authenticated user');
    err.status = 401;
    throw err;
  }
  return req.user;
}
