import { google, drive_v3 } from 'googleapis';
import { getSaJwt } from '../../server/utils/googleClient.js';

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

export function getDriveClient() {
  const auth = getSaJwt(DRIVE_SCOPES);
  return google.drive({ version: 'v3', auth });
}

type DriveMediaItem = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  modifiedTime?: string;
  thumbnailLink?: string;
  webContentLink?: string;
  iconLink?: string;
};

export async function listDriveMedia(folderId: string, _ctx: { userId: string }) {
  const drive = getDriveClient();
  const resp = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,size,modifiedTime,thumbnailLink,webContentLink,iconLink)',
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = (resp.data.files ?? []) as drive_v3.Schema$File[];

  return files
    .filter((f): f is drive_v3.Schema$File & { id: string } => typeof f.id === 'string')
    .map<DriveMediaItem>((f) => ({
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
