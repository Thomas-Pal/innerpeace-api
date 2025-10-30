import { google } from 'googleapis';

function getAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const creds = JSON.parse(json);
    return new google.auth.JWT(
      creds.client_email,
      undefined,
      creds.private_key,
      ['https://www.googleapis.com/auth/drive.readonly']
    );
  }
  return new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

export async function listFilesInFolder(folderId: string) {
  const auth = await getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const r = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType, modifiedTime, webViewLink, thumbnailLink, iconLink, size)',
    pageSize: 100,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  return r.data.files ?? [];
}
