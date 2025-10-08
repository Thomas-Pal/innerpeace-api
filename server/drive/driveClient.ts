import { google } from 'googleapis';

const { DRIVE_SA_CLIENT_EMAIL, DRIVE_SA_PRIVATE_KEY } = process.env;

if (!DRIVE_SA_CLIENT_EMAIL || !DRIVE_SA_PRIVATE_KEY) {
  console.warn('[Drive] Missing DRIVE_SA_CLIENT_EMAIL / DRIVE_SA_PRIVATE_KEY envs');
}

export function getDrive() {
  if (!DRIVE_SA_CLIENT_EMAIL || !DRIVE_SA_PRIVATE_KEY) {
    const err = new Error('Drive service account credentials are not configured');
    (err as any).status = 500;
    throw err;
  }

  const auth = new google.auth.JWT({
    email: DRIVE_SA_CLIENT_EMAIL,
    key: DRIVE_SA_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  return google.drive({ version: 'v3', auth });
}
