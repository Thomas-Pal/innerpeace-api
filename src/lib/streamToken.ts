import crypto from 'crypto';

const STREAM_SECRET = process.env.STREAM_SECRET!;

type Payload = { id: string; exp: number; sub?: string };

export function signStreamToken(p: Payload) {
  const body = Buffer.from(JSON.stringify(p)).toString('base64url');
  const sig = crypto.createHmac('sha256', STREAM_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyStreamToken(token: string): Payload | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', STREAM_SECRET).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as Payload;
  if (p.exp * 1000 < Date.now()) return null;
  return p;
}
