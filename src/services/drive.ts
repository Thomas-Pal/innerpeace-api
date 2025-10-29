import { google } from 'googleapis';
import { googleAuth } from './googleClient.js';

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

export async function getDriveClient() {
  const auth = googleAuth(DRIVE_SCOPES);
  const client = await auth.getClient();
  return google.drive({ version: 'v3', auth: client });
}

export async function listDriveMedia(folderId: string, _ctx: { userId: string }) {
  const drive = await getDriveClient();
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,size,modifiedTime,thumbnailLink,webContentLink,webViewLink)',
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  });

  return response.data.files ?? [];
}
