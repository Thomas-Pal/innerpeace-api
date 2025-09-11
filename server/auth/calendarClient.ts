// server/auth/calendarClient.ts
import { google, calendar_v3 } from 'googleapis';
import https from 'node:https';
import { URLSearchParams } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

type TokenCache = { accessToken: string; expiry: number };
let cache: TokenCache | null = null;

/**
 * Exchange a signed JWT (with sub=delegated user) for an OAuth2 access token.
 * No private keys in your app; we rely on IAM Credentials signJwt.
 */
async function exchangeJwtForAccessToken(assertion: string): Promise<{ access_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const txt = Buffer.concat(chunks).toString('utf8');
          try {
            const json = JSON.parse(txt);
            if (!json.access_token) {
              return reject(new Error(`token_exchange_failed: ${res.statusCode} ${txt}`));
            }
            resolve({ access_token: json.access_token, expires_in: json.expires_in || 3600 });
          } catch {
            reject(new Error(`token_parse_failed: ${txt.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function oauthFromAccessToken(token: string): OAuth2Client {
  const o = new OAuth2Client();
  o.setCredentials({ access_token: token });
  return o;
}

/**
 * Keyless Domain-Wide Delegation (DWD):
 *   - Cloud Run runtime SA must have roles/iam.serviceAccountTokenCreator on DWD_SA_EMAIL.
 *   - Workspace Admin must grant DWD to the DWD SA's OAuth2 client ID for Calendar scope.
 *
 * Required env:
 *   DWD_SA_EMAIL            e.g. calendar-dwd@innerpeace-app-471115.iam.gserviceaccount.com
 *   GOOGLE_DELEGATED_USER   e.g. thomaspal@innerpeace-developer.co.uk
 */
export default async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  const delegatedUser = process.env.GOOGLE_DELEGATED_USER;
  const dwdSaEmail = process.env.DWD_SA_EMAIL || process.env.GOOGLE_DWD_SA_EMAIL; // support either name
  if (!delegatedUser) throw new Error('Missing GOOGLE_DELEGATED_USER');
  if (!dwdSaEmail) throw new Error('Missing DWD_SA_EMAIL');

  const nowSec = Math.floor(Date.now() / 1000);
  if (cache && cache.expiry - 60 > nowSec) {
    return google.calendar({ version: 'v3', auth: oauthFromAccessToken(cache.accessToken) });
  }

  // Use a GoogleAuth *instance* (what google.options() wants), not a concrete client.
  const auth = new google.auth.GoogleAuth({
    scopes: [
      'https://www.googleapis.com/auth/iam',            // signJwt
      'https://www.googleapis.com/auth/cloud-platform', // broad but fine on Cloud Run
    ],
  });
  google.options({ auth }); // <- satisfies TS types for NodeNext

  // Build JWT claims to impersonate the manager (delegatedUser)
  const claims = {
    iss: dwdSaEmail,
    sub: delegatedUser,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  };

  // Ask IAM Credentials to sign the JWT using the DWD SA's system-managed key
  const iam = google.iamcredentials('v1');
  const name = `projects/-/serviceAccounts/${dwdSaEmail}`;
  const signed = await iam.projects.serviceAccounts.signJwt({
    name,
    requestBody: { payload: JSON.stringify(claims) },
  });
  const signedJwt = signed.data.signedJwt;
  if (!signedJwt) throw new Error('signJwt_failed: no signedJwt returned');

  // Exchange for an access token scoped for Calendar, on behalf of the delegated user
  const token = await exchangeJwtForAccessToken(signedJwt);
  cache = { accessToken: token.access_token, expiry: nowSec + token.expires_in };

  return google.calendar({ version: 'v3', auth: oauthFromAccessToken(cache.accessToken) });
}
