import { JWT } from 'google-auth-library';

function normalizeKey(k: string) {
  const normalized = k.trim().replace(/\\n/g, '\n');
  if (!normalized) return normalized;

  try {
    const maybePem = Buffer.from(normalized, 'base64').toString('utf8');
    if (maybePem.includes('BEGIN') && maybePem.includes('END')) {
      return maybePem.replace(/\\n/g, '\n');
    }
  } catch {}

  return normalized;
}

const GOOGLE_SA_EMAIL = process.env.GOOGLE_SA_EMAIL!;
const GOOGLE_SA_KEY = normalizeKey(process.env.GOOGLE_SA_KEY || '');

export function getSaJwt(scopes: string[]) {
  return new JWT({
    email: GOOGLE_SA_EMAIL,
    key: GOOGLE_SA_KEY,
    scopes,
  });
}
