import { google, drive_v3 } from 'googleapis';
import { getSaJwt } from '../../server/utils/googleClient.js';

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

export function getDriveClient() {
  const auth = getSaJwt(DRIVE_SCOPES);
  return google.drive({ version: 'v3', auth });
}

export async function listDriveMedia(folderId: string) {
  const drive = getDriveClient();
  const resp = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,size,modifiedTime,thumbnailLink,webContentLink,iconLink)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 1000,
  });
  const files = (resp.data.files ?? []) as drive_v3.Schema$File[];
  return files.map((f) => ({
    id: f.id!,
    name: f.name ?? '',
    mimeType: f.mimeType ?? 'application/octet-stream',
    sizeBytes: f.size ? Number(f.size) : undefined,
    modifiedTime: f.modifiedTime ?? undefined,
    thumbnailLink: f.thumbnailLink ?? undefined,
    webContentLink: f.webContentLink ?? undefined,
    iconLink: f.iconLink ?? undefined,
  }));
}
