import { google } from 'googleapis';
import { googleAuth } from '../../src/services/googleClient.js';

const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

export async function getCalendarClient() {
  const auth = googleAuth(CALENDAR_SCOPES);
  const client = await auth.getClient();
  return google.calendar({ version: 'v3', auth: client });
}
