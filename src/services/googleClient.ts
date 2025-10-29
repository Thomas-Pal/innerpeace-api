import { GoogleAuth } from 'google-auth-library';

const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID;
const GOOGLE_SA_EMAIL = process.env.GOOGLE_SA_EMAIL;
const GOOGLE_SA_KEY = process.env.GOOGLE_SA_KEY;

function required(value: string | undefined, name: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function normalizeKey(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (trimmed.includes('-----BEGIN')) {
    return trimmed.replace(/\\n/g, '\n');
  }

  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    if (decoded.includes('-----BEGIN')) {
      return decoded;
    }
    return decoded.replace(/\\n/g, '\n');
  } catch {
    return trimmed.replace(/\\n/g, '\n');
  }
}

export function googleAuth(scopes: string[]) {
  const projectId = required(GOOGLE_PROJECT_ID, 'GOOGLE_PROJECT_ID');
  const clientEmail = required(GOOGLE_SA_EMAIL, 'GOOGLE_SA_EMAIL');
  const privateKey = normalizeKey(required(GOOGLE_SA_KEY, 'GOOGLE_SA_KEY'));

  return new GoogleAuth({
    projectId,
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes,
  });
}
