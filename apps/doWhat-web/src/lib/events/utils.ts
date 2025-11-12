import ngeohash from 'ngeohash';

import type { NormalizedEvent, VenueMatchResult } from './types';

export const TEN_MINUTES_MS = 10 * 60 * 1000;

export const cleanString = (input: string | null | undefined): string =>
  (input ?? '')
    .replace(/\u0000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const normaliseTitle = (input: string): string =>
  cleanString(input)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const roundToTenMinutes = (date: Date): Date => {
  const time = date.getTime();
  const rounded = Math.floor(time / TEN_MINUTES_MS) * TEN_MINUTES_MS;
  return new Date(rounded);
};

export const toIsoString = (date: Date | null | undefined): string | null =>
  date ? new Date(date).toISOString() : null;

export const computeGeoHash = (lat: number | null | undefined, lng: number | null | undefined): string | null =>
  typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng)
    ? ngeohash.encode(lat, lng, 7)
    : null;

export const buildDedupeKey = (
  normalizedTitle: string,
  bucket: Date,
  placeId: string | null | undefined,
  geohash7: string | null | undefined,
): string => {
  const locationKey = placeId ?? geohash7 ?? 'none';
  return `${normalizedTitle}|${bucket.toISOString()}|${locationKey}`;
};

export const ensureTagArray = (tags?: (string | null | undefined)[]): string[] =>
  Array.from(
    new Set(
      (tags ?? [])
        .map((tag) => cleanString(tag ?? ''))
        .filter((value) => value.length > 0)
        .map((value) => value.toLowerCase()),
    ),
  );

export const applyVenueMatch = (
  event: NormalizedEvent,
  match: VenueMatchResult,
): NormalizedEvent => ({
  ...event,
  lat: match.lat ?? event.lat ?? null,
  lng: match.lng ?? event.lng ?? null,
  venueName: match.venueName ?? event.venueName ?? null,
  address: match.address ?? event.address ?? null,
});

export const EVENT_WINDOW_DAYS = 30;

export const nowUtc = (): Date => new Date();

export const clampDateRange = (start: Date, days: number): { from: Date; to: Date } => {
  const from = new Date(start);
  const to = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return { from, to };
};

export const parseMaybeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

export const toDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

export const limitFutureWindow = (date: Date | null, maxDays = EVENT_WINDOW_DAYS): Date | null => {
  if (!date) return null;
  const maxDate = new Date(nowUtc().getTime() + maxDays * 24 * 60 * 60 * 1000);
  return date > maxDate ? maxDate : date;
};

export const DEFAULT_EVENT_TIMEZONE = 'UTC';

export const inferTimezone = (event: NormalizedEvent): string =>
  event.timezone || DEFAULT_EVENT_TIMEZONE;
