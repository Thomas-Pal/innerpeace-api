import { google, calendar_v3 } from 'googleapis';

export type AuthMode = 'keyless-dwd' | 'adc';

export default async function getCalendarClient(mode: AuthMode = 'keyless-dwd'): Promise<calendar_v3.Calendar> {
  const scopes = ['https://www.googleapis.com/auth/calendar'];
  const delegatedUser = process.env.GOOGLE_DELEGATED_USER || '';
  const dwdSaEmail = process.env.DWD_SA_EMAIL || '';

  if (mode === 'keyless-dwd') {
    if (!delegatedUser || !dwdSaEmail) throw new Error('DWD envs missing');
    const iam = google.iamcredentials('v1');
    const name = `projects/-/serviceAccounts/${dwdSaEmail}`;
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: dwdSaEmail,
      sub: delegatedUser,
      aud: 'https://oauth2.googleapis.com/token',
      scope: scopes.join(' '),
      iat: now,
      exp: now + 3600
    };

    const { data } = await iam.projects.serviceAccounts.signJwt({
      name, requestBody: { payload: JSON.stringify(payload) }
    });

    const assertion = data.signedJwt;
    if (!assertion) throw new Error('signJwt failed');

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      })
    });
    if (!resp.ok) throw new Error(`token_exchange_failed: ${resp.status} ${await resp.text()}`);

    const tok = await resp.json() as { access_token: string };
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: tok.access_token });

    google.options({ auth }); // force Authorization on all googleapis calls
    return google.calendar({ version: 'v3', auth });
  }

  // ADC fallback: share calendar with runtime SA if you ever use this path
  const auth = new google.auth.GoogleAuth({ scopes });
  google.options({ auth });
  return google.calendar({ version: 'v3', auth });
}
