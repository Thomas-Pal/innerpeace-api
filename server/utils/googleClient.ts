import { JWT } from 'google-auth-library';

function normalizeKey(rawKey: string | undefined) {
  if (!rawKey) return '';

  const normalized = rawKey.trim().replace(/\\n/g, '\n');
  if (!normalized) return normalized;

  try {
    const b64 = Buffer.from(normalized, 'base64').toString('utf8');
    if (b64.includes('BEGIN') && b64.includes('END')) return b64;
  } catch {}
  return normalized;
}

let cachedCredentials: { email: string; key: string } | null = null;

function resolveServiceAccount() {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const email = process.env.GOOGLE_SA_EMAIL?.trim();
  const key = normalizeKey(process.env.GOOGLE_SA_KEY);

  if (!email || !key) {
    throw new Error('Google service account credentials are not configured. Set GOOGLE_SA_EMAIL and GOOGLE_SA_KEY.');
  }

  cachedCredentials = { email, key };
  return cachedCredentials;
}

export function getSaJwt(scopes: string[]) {
  const { email, key } = resolveServiceAccount();
  return new JWT({ email, key, scopes });
}
