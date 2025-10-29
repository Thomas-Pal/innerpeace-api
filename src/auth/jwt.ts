import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const APP_JWT_ISSUER = process.env.APP_JWT_ISSUER || 'https://innerpeace.app';
const APP_JWT_AUDIENCE = process.env.APP_JWT_AUDIENCE || 'innerpeace-app';

function buildDefaultJwksUri(issuer: string): string {
  const trimmed = issuer.replace(/\/+$/, '');
  return `${trimmed}/.well-known/jwks.json`;
}

const APP_JWKS_URI = process.env.APP_JWKS_URI || buildDefaultJwksUri(APP_JWT_ISSUER);

const jwks = createRemoteJWKSet(new URL(APP_JWKS_URI));

export type AuthClaims = JWTPayload & {
  sub: string;
  email?: string;
  provider?: 'google' | 'apple' | string;
  roles?: string[];
};

export async function verifyAppJwt(token: string): Promise<AuthClaims> {
  const normalized = token?.trim();
  if (!normalized) {
    throw new Error('JWT is empty');
  }

  const { payload } = await jwtVerify(normalized, jwks, {
    issuer: APP_JWT_ISSUER,
    audience: APP_JWT_AUDIENCE,
  });

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('JWT payload is missing subject');
  }

  return payload as AuthClaims;
}
