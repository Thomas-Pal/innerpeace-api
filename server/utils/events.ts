import type { calendar_v3 } from 'googleapis';

export function pickMeetUrl(ev: calendar_v3.Schema$Event): string | null {
  const ep = ev?.conferenceData?.entryPoints as any[] | undefined;
  const fromEp = Array.isArray(ep)
    ? (ep.find((x: any) => x?.entryPointType === 'video')?.uri as string | undefined)
    : undefined;
  return (ev as any)?.hangoutLink || fromEp || null;
}
