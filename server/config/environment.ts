export type UseMeetMode = 'auto' | 'always' | 'never';
export type SendUpdatesMode = 'all' | 'externalOnly' | 'none';

const env = process.env as Record<string, string | undefined>;

function parseUseMeet(value: string | undefined): UseMeetMode {
  const normalized = (value || 'auto').toLowerCase();
  switch (normalized) {
    case 'always':
    case 'never':
      return normalized;
    case 'auto':
    default:
      return 'auto';
  }
}

function parseSendUpdates(value: string | undefined): SendUpdatesMode {
  const normalized = (value || 'all').toLowerCase();
  switch (normalized) {
    case 'externalonly':
      return 'externalOnly';
    case 'none':
      return 'none';
    case 'all':
    default:
      return 'all';
  }
}

export interface AppConfig {
  port: number;
  calendarId: string;
  managerCalendarId: string;
  managerEmail: string;
  useMeet: UseMeetMode;
  sendUpdates: SendUpdatesMode;
  bookOrganizerMode: string;
}

const config: AppConfig = {
  port: Number(env.PORT || '8080'),
  calendarId: env.CALENDAR_ID || 'primary',
  managerCalendarId: env.MANAGER_CALENDAR_ID || '',
  managerEmail: env.MANAGER_EMAIL || 'thomaspal@innerpeace-developer.co.uk',
  useMeet: parseUseMeet(env.USE_MEET),
  sendUpdates: parseSendUpdates(env.SEND_UPDATES),
  bookOrganizerMode: env.BOOK_ORGANIZER_MODE || 'manager',
};

export const targetCalendarId = config.managerCalendarId || config.calendarId;

export default config;
