import type { Request } from 'express';
import type { drive_v3 } from 'googleapis';
import createError from 'http-errors';
import { google } from 'googleapis';
import { GoogleAuth, Impersonated, OAuth2Client } from 'google-auth-library';

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
    return new GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
      scopes: DRIVE_SCOPES,
    });
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('No Google credentials configured. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CREDENTIALS_JSON.');
  }

  return new GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: DRIVE_SCOPES,
  });
}

export async function driveClientFromServiceAccount(): Promise<drive_v3.Drive> {
  const auth = getServiceAccountAuth();
  return google.drive({ version: 'v3', auth });
}

async function driveClientFromImpersonation(): Promise<drive_v3.Drive> {
  const targetPrincipal = process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT;
  if (!targetPrincipal) {
    throw new Error('GOOGLE_IMPERSONATE_SERVICE_ACCOUNT is not configured.');
  }

  const sourceAuth = new GoogleAuth({ scopes: DRIVE_SCOPES });
  const sourceClient = await sourceAuth.getClient();

  const targetClient = new Impersonated({
    sourceClient,
    targetPrincipal,
    lifetime: 3600,
    delegates: [],
    targetScopes: DRIVE_SCOPES,
  });

  return google.drive({ version: 'v3', auth: targetClient });
}

async function driveClientFromUserAccessToken(accessToken: string): Promise<drive_v3.Drive> {
  const oauth = new OAuth2Client();
  oauth.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth: oauth });
}

export async function driveClientFromRequest(req: Request): Promise<drive_v3.Drive> {
  if (process.env.GOOGLE_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return driveClientFromServiceAccount();
  }

  if (process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT) {
    return driveClientFromImpersonation();
  }

  const userToken = req.header('x-oauth-access-token');
  if (userToken) {
    return driveClientFromUserAccessToken(userToken);
  }

  throw new Error('No Google credentials configured. Provide GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_CREDENTIALS_JSON, GOOGLE_IMPERSONATE_SERVICE_ACCOUNT, or x-oauth-access-token.');
}
