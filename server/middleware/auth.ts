import type { NextFunction, Request, Response } from 'express';
import type { JWTPayload } from 'jose';
import { createRemoteJWKSet, jwtVerify } from 'jose';

type Provider = 'google' | 'apple';

export interface AuthenticatedUser {
  provider: Provider;
  uid: string;
  email: string | null;
  claims: JWTPayload;
  token: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const APPLE_ISSUER = 'https://appleid.apple.com';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const defaultAppleAudiences = ['com.innerpeace.app'];
const defaultGoogleAudiences = [
  '379484922687-q7ge8kg89o0vi1gn1lkjaqciu8e8e3eb.apps.googleusercontent.com',
  '379484922687-j3bc9264v49hpqloi98897jbfg0acjjm.apps.googleusercontent.com',
];

const appleJWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const googleJWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

function splitAudiences(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function getAudienceValue(audiences: string[]): string | string[] | undefined {
  if (!audiences.length) return undefined;
  if (audiences.length === 1) return audiences[0];
  return audiences;
}

async function verifyAppleIdToken(token: string, audienceList: string[]): Promise<JWTPayload> {
  const audience = getAudienceValue(audienceList);
  const { payload } = await jwtVerify(token, appleJWKS, {
    issuer: APPLE_ISSUER,
    ...(audience ? { audience } : {}),
  });
  return payload;
}

async function verifyGoogleIdToken(token: string, audienceList: string[]): Promise<JWTPayload> {
  const audience = getAudienceValue(audienceList);
  const { payload } = await jwtVerify(token, googleJWKS, {
    issuer: GOOGLE_ISSUERS,
    ...(audience ? { audience } : {}),
  });
  return payload;
}

function extractBearer(headerValue: string | undefined | null): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match ? match[1] : null;
}

function missingTokenResponse(res: Response, provider: Provider) {
  const message = provider === 'apple' ? 'Missing Apple token' : 'Missing Google token';
  return res.status(401).json({ message, code: 401 });
}

export interface AuthMiddlewareOptions {
  appleAudiences?: string[];
  googleAudiences?: string[];
}

export function authMiddleware(options: AuthMiddlewareOptions = {}) {
  const appleAudiences = options.appleAudiences ?? splitAudiences(process.env.APPLE_SIGN_IN_AUDIENCES, defaultAppleAudiences);
  const googleAudiences =
    options.googleAudiences ?? splitAudiences(process.env.GOOGLE_SIGN_IN_AUDIENCES, defaultGoogleAudiences);

  return async function authHandler(req: Request, res: Response, next: NextFunction) {
    try {
      const providerHeader = (req.header('x-auth-provider') || '').toLowerCase();
      const explicitAppleToken = req.header('x-apple-identity-token');
      const bearerToken = extractBearer(req.header('authorization'));

      let provider: Provider;
      let token: string | null = null;

      if (providerHeader === 'apple') {
        provider = 'apple';
        token = explicitAppleToken || bearerToken;
        if (!token) return missingTokenResponse(res, provider);
      } else if (providerHeader === 'google') {
        provider = 'google';
        token = bearerToken;
        if (!token) return missingTokenResponse(res, provider);
      } else if (explicitAppleToken) {
        provider = 'apple';
        token = explicitAppleToken;
      } else if (bearerToken) {
        provider = 'google';
        token = bearerToken;
      } else {
        return res.status(401).json({ message: 'Missing authentication token', code: 401 });
      }

      const payload =
        provider === 'apple'
          ? await verifyAppleIdToken(token, appleAudiences)
          : await verifyGoogleIdToken(token, googleAudiences);

      const subject = (payload.sub || (payload as any).user_id || '').toString();
      if (!subject) {
        throw new Error('Token is missing subject');
      }

      const email = typeof payload.email === 'string' ? payload.email : null;
      req.user = { provider, uid: subject, email, claims: payload, token };

      return next();
    } catch (error) {
      console.error('[auth] token verification failed', error);
      return res.status(401).json({ message: 'Invalid token', code: 401 });
    }
  };
}

export function requireAuth(req: Request): AuthenticatedUser {
  if (!req.user) {
    const err: any = new Error('Missing authenticated user');
    err.status = 401;
    throw err;
  }
  return req.user;
}
