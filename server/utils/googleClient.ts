import type { Request } from 'express';
import type { drive_v3 } from 'googleapis';
import createError from 'http-errors';
import { google } from 'googleapis';

export async function calendarClientFromRequest(req: Request) {
  const userToken = req.header('x-oauth-access-token');
  if (userToken) {
    const oauth2 = new google.auth.OAuth2();
    oauth2.setCredentials({ access_token: userToken });
    return google.calendar({ version: 'v3', auth: oauth2 });
  }

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

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

export function getServiceAccountAuth() {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
      scopes: DRIVE_SCOPES,
    });
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('No Google credentials configured. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CREDENTIALS_JSON.');
  }

  return new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: DRIVE_SCOPES,
  });
}

export async function driveClientFromServiceAccount(): Promise<drive_v3.Drive> {
  const auth = getServiceAccountAuth();
  return google.drive({ version: 'v3', auth });
}
