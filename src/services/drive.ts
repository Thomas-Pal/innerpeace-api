import { google, type drive_v3 } from 'googleapis';
import { getSaJwt } from '../../server/utils/googleClient.js';

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

let cachedClient: drive_v3.Drive | null = null;

export function getDriveClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const auth = getSaJwt(DRIVE_SCOPES);
  cachedClient = google.drive({ version: 'v3', auth });
  return cachedClient;
}

export interface ListDriveMediaOptions {
  pageToken?: string;
  pageSize?: number;
  mimeTypes?: string[];
}

export interface ListDriveMediaResult {
  files: drive_v3.Schema$File[];
  nextPageToken: string | null;
}

export async function listDriveMedia(
  folderId: string,
  { pageToken, pageSize, mimeTypes }: ListDriveMediaOptions = {}
): Promise<ListDriveMediaResult> {
  const drive = getDriveClient();
  const safeFolderId = folderId.replace(/'/g, "\\'");
  const filters = (mimeTypes && mimeTypes.length ? mimeTypes : null) || [
    "mimeType contains 'audio/'",
    "mimeType='audio/mpeg'",
    "mimeType='audio/mp4'",
    "mimeType='audio/x-m4a'",
    "mimeType='audio/wav'",
  ];

  const normalizedFilters = filters.map((f) => {
    if (f.startsWith('mimeType')) {
      return f;
    }
    const safeValue = f.replace(/'/g, "\\'");
    return `mimeType='${safeValue}'`;
  });

  const query = [
    `'${safeFolderId}' in parents`,
    'trashed = false',
    `(${normalizedFilters.join(' or ')})`,
  ].join(' and ');

  const { data } = await drive.files.list({
    q: query,
    fields:
      'nextPageToken, files(id,name,mimeType,size,md5Checksum,modifiedTime,createdTime,iconLink,thumbnailLink)',
    orderBy: 'modifiedTime desc',
    pageToken,
    pageSize: Math.min(Math.max(pageSize ?? 50, 1), 200),
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  });

  return {
    files: (data.files || []) as drive_v3.Schema$File[],
    nextPageToken: data.nextPageToken || null,
  };
}
