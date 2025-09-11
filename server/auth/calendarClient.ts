// server/auth/calendarClient.ts
import { google, calendar_v3 } from 'googleapis';
import fs from 'node:fs';

/**
 * Domain-Wide Delegation (DWD) Calendar client.
 * Impersonates GOOGLE_DELEGATED_USER (the manager) using a service account key.
 *
 * Required env:
 * - GOOGLE_DELEGATED_USER              // e.g. thomaspal@innerpeace-developer.co.uk
 * - Either:
 *     GOOGLE_DWD_SA_KEY_JSON           // full JSON key as a string (recommended via Secret Manager)
 *   OR GOOGLE_DWD_SA_KEY_PATH          // filesystem path to the JSON key (mounted secret)
 */
const SCOPE = 'https://www.googleapis.com/auth/calendar';

let cached: calendar_v3.Calendar | null = null;

function readSaKey(): { client_email: string; private_key: string } {
  const json = process.env.GOOGLE_DWD_SA_KEY_JSON;
  if (json) {
    const parsed = JSON.parse(json);
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  }
  const path = process.env.GOOGLE_DWD_SA_KEY_PATH;
  if (!path) throw new Error('Missing GOOGLE_DWD_SA_KEY_JSON or GOOGLE_DWD_SA_KEY_PATH');
  const raw = fs.readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw);
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

export default async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  if (cached) return cached;

  const delegatedUser = process.env.GOOGLE_DELEGATED_USER;
  if (!delegatedUser) throw new Error('Missing GOOGLE_DELEGATED_USER');

  const { client_email, private_key } = readSaKey();

  const jwt = new google.auth.JWT({
    email: client_email,
    key: private_key,
    scopes: [SCOPE],
    subject: delegatedUser, // impersonate manager
  });

  cached = google.calendar({ version: 'v3', auth: jwt });
  return cached;
}
