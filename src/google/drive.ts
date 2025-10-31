import { google, type drive_v3 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

let cachedDrive: drive_v3.Drive | null = null;

export async function getDrive() {
  if (cachedDrive) {
    return cachedDrive;
  }

  const json = process.env.GOOGLE_SA_JSON;
  if (json) {
    const { client_email, private_key } = JSON.parse(json);
    const auth = new google.auth.JWT({
      email: client_email,
      key: private_key,
      scopes: SCOPES,
    });
    cachedDrive = google.drive({ version: 'v3', auth });
    return cachedDrive;
  }

  const email = process.env.GOOGLE_SA_EMAIL;
  const key = process.env.GOOGLE_SA_KEY;
  if (email && key) {
    const auth = new google.auth.JWT({
      email,
      key: key.replace(/\\n/g, '\n'),
      scopes: SCOPES,
    });
    cachedDrive = google.drive({ version: 'v3', auth });
    return cachedDrive;
  }

  const auth = new GoogleAuth({ scopes: SCOPES });
  const client = (await auth.getClient()) as drive_v3.Options['auth'];
  cachedDrive = google.drive({ version: 'v3', auth: client });
  return cachedDrive;
}
