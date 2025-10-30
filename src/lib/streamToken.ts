import crypto from 'crypto';

const STREAM_SECRET = process.env.STREAM_SECRET!;

type Payload = { id: string; exp: number; sub?: string };

export function signStreamToken(p: Payload) {
  const b = Buffer.from(JSON.stringify(p)).toString('base64url');
  const s = crypto.createHmac('sha256', STREAM_SECRET).update(b).digest('base64url');
  return `${b}.${s}`;
}

export function verifyStreamToken(t: string) {
  const [b, s] = t.split('.');
  if (!b || !s) return null;
  const e = crypto.createHmac('sha256', STREAM_SECRET).update(b).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString()) as Payload;
  if (p.exp * 1000 < Date.now()) return null;
  return p;
}
