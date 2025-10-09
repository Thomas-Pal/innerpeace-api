import { google } from 'googleapis';
import createError from 'http-errors';
import type { Request } from 'express';

// Use user OAuth access token when present (preferred path).
export async function calendarClientFromRequest(req: Request) {
  const userToken = req.header('x-oauth-access-token');
  if (userToken) {
    const oauth2 = new google.auth.OAuth2();
    oauth2.setCredentials({ access_token: userToken });
    return google.calendar({ version: 'v3', auth: oauth2 });
  }

  // Optional fallback: Domain-Wide Delegation only if fully configured.
  const subj = process.env.GOOGLE_DELEGATED_USER;
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const key = rawKey?.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;

  if (subj && email && key) {
    const jwt = new google.auth.JWT({
      email,
      key,
      subject: subj,
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
    });
    await jwt.authorize();
    return google.calendar({ version: 'v3', auth: jwt });
  }

  throw createError(401, 'Missing user access token and no DWD fallback configured');
}

// Service Account via ADC (Cloud Run service account) for Drive.
export async function driveClientFromADC() {
  const auth = await google.auth.getClient({
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}
