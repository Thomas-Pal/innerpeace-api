import { google } from 'googleapis';

// Uses Application Default Credentials on Cloud Run
export function driveClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}
