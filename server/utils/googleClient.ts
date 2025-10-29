import { JWT } from 'google-auth-library';

function normalizeKey(k: string) {
  const normalized = k.trim().replace(/\\n/g, '\n');
  if (!normalized) return normalized;

  try {
    const b64 = Buffer.from(normalized, 'base64').toString('utf8');
    if (b64.includes('BEGIN') && b64.includes('END')) return b64;
  } catch {}
  return normalized;
}

const GOOGLE_SA_EMAIL = process.env.GOOGLE_SA_EMAIL;
if (!GOOGLE_SA_EMAIL) {
  throw new Error('GOOGLE_SA_EMAIL is not configured');
}
const GOOGLE_SA_KEY = normalizeKey(process.env.GOOGLE_SA_KEY || '');

export function getSaJwt(scopes: string[]) {
  return new JWT({ email: GOOGLE_SA_EMAIL, key: GOOGLE_SA_KEY, scopes });
}
