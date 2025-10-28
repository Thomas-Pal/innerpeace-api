import type { JWTPayload } from 'jose';
import { jwtVerify } from 'jose';

const textEncoder = new TextEncoder();

export async function verifyAppJwt(token: string): Promise<JWTPayload> {
  const secret = process.env.SESSION_JWT_SECRET;
  if (!secret) {
    throw new Error('SESSION_JWT_SECRET is not configured');
  }

  const { payload } = await jwtVerify(token, textEncoder.encode(secret), {
    algorithms: ['HS256'],
  });

  return payload;
}
