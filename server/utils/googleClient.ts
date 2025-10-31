import { JWT } from 'google-auth-library';

type ServiceAccount = { email: string; key: string };

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

function parseServiceAccountJson(rawJson: string | undefined): ServiceAccount | null {
  if (!rawJson) return null;

  try {
    const decoded = Buffer.from(rawJson.trim(), 'base64').toString('utf8');
    if (decoded.includes('client_email') && decoded.includes('private_key')) {
      const parsed = JSON.parse(decoded);
      if (parsed.client_email && parsed.private_key) {
        return { email: parsed.client_email, key: normalizeKey(parsed.private_key) };
      }
    }
  } catch {}

  try {
    const parsed = JSON.parse(rawJson);
    if (parsed.client_email && parsed.private_key) {
      return { email: parsed.client_email, key: normalizeKey(parsed.private_key) };
    }
  } catch {}

  return null;
}

let cachedCredentials: ServiceAccount | null = null;

function resolveServiceAccount(): ServiceAccount {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const jsonCandidate =
    process.env.GOOGLE_SA_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_SA_CREDENTIALS;

  const parsed = parseServiceAccountJson(jsonCandidate);
  if (parsed) {
    cachedCredentials = parsed;
    return cachedCredentials;
  }

  const email = process.env.GOOGLE_SA_EMAIL?.trim();
  const key = normalizeKey(process.env.GOOGLE_SA_KEY);

  if (!email || !key) {
    throw new Error(
      'Google service account credentials are not configured. Set GOOGLE_SA_JSON (or GOOGLE_SA_EMAIL/GOOGLE_SA_KEY).'
    );
  }

  cachedCredentials = { email, key };
  return cachedCredentials;
}

export function getSaJwt(scopes: string[]) {
  const { email, key } = resolveServiceAccount();
  return new JWT({ email, key, scopes });
}
