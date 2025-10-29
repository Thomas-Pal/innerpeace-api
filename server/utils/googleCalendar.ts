import { google } from 'googleapis';
import { getSaJwt } from './googleClient.js';

const CAL_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

export function getCalendarClient() {
  const auth = getSaJwt(CAL_SCOPES);
  return google.calendar({ version: 'v3', auth });
}
