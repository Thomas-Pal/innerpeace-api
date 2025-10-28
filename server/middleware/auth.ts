import type { NextFunction, Request, Response } from 'express';
import type { JWTPayload } from 'jose';
import {
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
} from 'jose';
import { verifyAppJwt } from '../utils/appJwt.js';
import { readAppJwt } from '../utils/readAppJwt.js';

export type Provider = 'google' | 'apple' | 'session';

export interface AuthenticatedUser {
  provider: Provider;
  uid: string;
  email: string | null;
  claims: JWTPayload;
  /** The original token if present (may be null behind API Gateway). */
  token: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      /** Your *app* JWT from the x-app-jwt header. */
      appJwt?: string | null;
    }
  }
}

const appleJWKS = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
);
const googleJWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const APPLE_ISSUER = 'https://appleid.apple.com';

const GOOGLE_AUDIENCES: string[] = [
  '379484922687-q7ge8kg89o0vi1gn1lkjaqciu8e8e3eb.apps.googleusercontent.com',
  '379484922687-j3bc9264v49hpqloi98897jbfg0acjjm.apps.googleusercontent.com',
];

function extractBearer(headerValue?: string | null): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match ? match[1] : null;
}

function decodeBase64UrlToUtf8(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding ? normalized + '='.repeat(4 - padding) : normalized;
  return Buffer.from(padded, 'base64').toString('utf8');
}

function normalizeSubject(payload: JWTPayload): string {
  const subject = typeof payload.sub === 'string' ? payload.sub : null;
  if (!subject) {
    throw new Error('Token is missing subject (sub).');
  }
  return subject;
}

function detectProviderFromToken(token: string): Provider {
  const header = decodeProtectedHeader(token);
  const alg = header.alg ? String(header.alg) : '';
  if (alg.toUpperCase().startsWith('HS')) {
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
  throw new Error(`Unknown token issuer: ${issuer}`);
}

async function verifyApple(idToken: string) {
  const { payload } = await jwtVerify(idToken, appleJWKS, {
    issuer: APPLE_ISSUER,
    audience: process.env.APPLE_AUDIENCE_BUNDLE_ID ?? 'com.innerpeace.app',
    algorithms: ['RS256'],
  });
  return payload;
}

async function verifyGoogle(idToken: string) {
  const { payload } = await jwtVerify(idToken, googleJWKS, {
    issuer: GOOGLE_ISSUERS,
    audience: GOOGLE_AUDIENCES,
    algorithms: ['RS256'],
  });
  return payload;
}

export async function authHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const appJwt = readAppJwt(req);
    req.appJwt = appJwt;

    const gatewayUserInfo = req.header('x-endpoint-api-userinfo');
    if (gatewayUserInfo) {
      try {
        const claims = JSON.parse(
          decodeBase64UrlToUtf8(gatewayUserInfo),
        ) as JWTPayload;

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
          token: null,
        };
        return next();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[auth] failed to parse X-Endpoint-API-UserInfo:', err);
      }
    }

    const providerHeader = (req.header('x-auth-provider') || '').toLowerCase();
    const authorizationToken = extractBearer(req.header('authorization'));

    let provider: Provider | null = null;
    let tokenForVerification: string | null = null;

    if (providerHeader === 'session') {
      if (!appJwt) {
        return res.status(401).json({ message: 'Jwt is missing', code: 401 });
      }
      provider = 'session';
      tokenForVerification = appJwt;
    } else {
      if (!authorizationToken) {
        return res.status(401).json({ message: 'Jwt is missing', code: 401 });
      }

      if (providerHeader === 'google') {
        provider = 'google';
      } else if (providerHeader === 'apple') {
        provider = 'apple';
      } else {
        provider = detectProviderFromToken(authorizationToken);
        if (provider === 'session') {
          return res.status(401).json({ message: 'Jwt is missing', code: 401 });
        }
      }
      tokenForVerification = authorizationToken;
    }

    if (!provider || !tokenForVerification) {
      return res.status(401).json({ message: 'Jwt is missing', code: 401 });
    }

    let claims: JWTPayload;
    if (provider === 'google') {
      claims = await verifyGoogle(tokenForVerification);
    } else if (provider === 'apple') {
      claims = await verifyApple(tokenForVerification);
    } else {
      claims = await verifyAppJwt(tokenForVerification);
    }

    const uid = normalizeSubject(claims);
    const email = typeof claims.email === 'string' ? claims.email : null;

    req.user = { provider, uid, email, claims, token: tokenForVerification };
    return next();
  } catch (error) {
    // eslint-disable-next-line no-console
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
