import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const toIcsUtc = (date: Date): string =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

const addHours = (date: Date, hours: number): Date => new Date(date.getTime() + hours * 60 * 60 * 1000);
const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const buildBangkokBootstrapIcs = (sourceLabel: string): string => {
  const now = new Date();
  const firstStart = addHours(addDays(now, 1), 2);
  const secondStart = addHours(addDays(now, 2), 1);
  const thirdStart = addHours(addDays(now, 4), 3);

  const firstEnd = addHours(firstStart, 2);
  const secondEnd = addHours(secondStart, 3);
  const thirdEnd = addHours(thirdStart, 2);

  const dtStamp = toIcsUtc(now);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//doWhat//Bangkok Bootstrap Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:bangkok-bootstrap-billiards@dowhat.app`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${toIcsUtc(firstStart)}`,
    `DTEND:${toIcsUtc(firstEnd)}`,
    'SUMMARY:Bangkok Billiards Meetup',
    'DESCRIPTION:Weekly community billiards session for all skill levels.',
    'LOCATION:Hustlers Bangkok, Sukhumvit, Bangkok',
    'GEO:13.7373;100.5594',
    'STATUS:CONFIRMED',
    `URL:https://dowhat.app/bootstrap/${encodeURIComponent(sourceLabel)}/billiards`,
    'END:VEVENT',
    'BEGIN:VEVENT',
    `UID:bangkok-bootstrap-yoga@dowhat.app`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${toIcsUtc(secondStart)}`,
    `DTEND:${toIcsUtc(secondEnd)}`,
    'SUMMARY:Sunrise Yoga at Lumphini Park',
    'DESCRIPTION:Outdoor yoga flow session at Lumphini Park.',
    'LOCATION:Lumphini Park, Bangkok',
    'GEO:13.7307;100.5418',
    'STATUS:CONFIRMED',
    `URL:https://dowhat.app/bootstrap/${encodeURIComponent(sourceLabel)}/yoga`,
    'END:VEVENT',
    'BEGIN:VEVENT',
    `UID:bangkok-bootstrap-boat@dowhat.app`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${toIcsUtc(thirdStart)}`,
    `DTEND:${toIcsUtc(thirdEnd)}`,
    'SUMMARY:Canal Boat Activity Tour',
    'DESCRIPTION:Guided social boat activity on Bangkok canals.',
    'LOCATION:Sathon Pier, Bangkok',
    'GEO:13.7188;100.5145',
    'STATUS:CONFIRMED',
    `URL:https://dowhat.app/bootstrap/${encodeURIComponent(sourceLabel)}/boat`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sourceLabel = url.searchParams.get('source')?.trim() || 'default';
  const body = buildBangkokBootstrapIcs(sourceLabel);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
