import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

export async function getDrive() {
  // Prefer secrets if present (local/dev)
  const json = process.env.GOOGLE_SA_JSON;
  if (json) {
    const { client_email, private_key } = JSON.parse(json);
    const auth = new google.auth.JWT({ email: client_email, key: private_key, scopes: SCOPES });
    return google.drive({ version: 'v3', auth });
  }
  const email = process.env.GOOGLE_SA_EMAIL;
  const key = process.env.GOOGLE_SA_KEY;
  if (email && key) {
    const auth = new google.auth.JWT({ email, key: key.replace(/\\n/g, '\n'), scopes: SCOPES });
    return google.drive({ version: 'v3', auth });
  }
  // Default to ADC (Cloud Run runtime SA)
  const auth = new GoogleAuth({ scopes: SCOPES });
  await auth.getClient();
  return google.drive({ version: 'v3', auth });
}
