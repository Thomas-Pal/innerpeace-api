import jwt from 'jsonwebtoken';
import type { Request } from 'express';

export type SupabaseJwtPayload = jwt.JwtPayload & { sub?: string };

function ensureSecret(): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error('SUPABASE_JWT_SECRET is not configured.');
  }
  return secret;
}

const BEARER_HEADER_CANDIDATES = [
  'X-Forwarded-Authorization',
  'x-forwarded-authorization',
  'Authorization',
  'authorization',
];

export function extractBearerToken(req: Pick<Request, 'header'>): string | null {
  for (const header of BEARER_HEADER_CANDIDATES) {
    const value = req.header(header) || '';
    if (typeof value === 'string' && value.startsWith('Bearer ')) {
      return value.slice(7);
    }
  }
  return null;
}

export function verifySupabaseJwt(token: string): SupabaseJwtPayload {
  const secret = ensureSecret();
  const verified = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (typeof verified === 'string') {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded === 'string') {
      throw new Error('Failed to decode Supabase JWT payload.');
    }
    return decoded as SupabaseJwtPayload;
  }
  return verified as SupabaseJwtPayload;
}
