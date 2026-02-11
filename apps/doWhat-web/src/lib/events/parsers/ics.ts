import * as ical from 'node-ical';

import type { EventSourceRow, NormalizedEvent } from '../types';
import {
  cleanString,
  clampDateRange,
  ensureTagArray,
  normaliseTitle,
  nowUtc,
  parseMaybeNumber,
  roundToTenMinutes,
  toDate,
} from '../utils';

const RECURRENCE_WINDOW_DAYS = 30;
const PAST_GRACE_PERIOD_HOURS = 12;

type ICalDateValue = Date | string | number | { toJSDate?: () => Date; tzid?: string } | null | undefined;

type ICalDuration = {
  toMilliseconds?: () => number;
};

type ICalRecurrenceRule = {
  between: (from: Date, to: Date, inclusive?: boolean) => Date[];
};

type ICalGeo = {
  lat?: number;
  latitude?: number;
  lng?: number;
  lon?: number;
  longitude?: number;
};

type ICalComponent = Record<string, unknown> & {
  type?: string | null;
  start?: ICalDateValue;
  dtstart?: ICalDateValue | { tzid?: string } | null;
  exdate?: Record<string, unknown> | null;
  exdates?: Record<string, unknown> | null;
  duration?: number | ICalDuration | null;
  end?: ICalDateValue;
  status?: string | null;
  summary?: string | null;
  description?: unknown;
  location?: string | null;
  url?: string | null;
  tz?: string | null;
  tzid?: string | null;
  timezone?: string | null;
  rrule?: ICalRecurrenceRule | null;
  categories?: unknown;
  geo?: ICalGeo | null;
  uid?: string | null;
};

const hasTzId = (value: unknown): value is { tzid?: string } =>
  Boolean(value && typeof value === 'object' && 'tzid' in value);

const isCancelled = (status?: string | null): boolean =>
  (status ?? '').toLowerCase() === 'cancelled';

const parseDescription = (value: unknown): string | null => {
  if (typeof value === 'string') return cleanString(value);
  if (Array.isArray(value)) {
    const joined = value.map((item) => (typeof item === 'string' ? item : '')).join('\n');
    return cleanString(joined);
  }
  return null;
};

const toStatus = (raw?: string | null): 'scheduled' | 'canceled' => (isCancelled(raw) ? 'canceled' : 'scheduled');

const toTags = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return ensureTagArray(value as (string | null | undefined)[]);
  }
  if (typeof value === 'string') {
    return ensureTagArray(value.split(',').map((part) => part.trim()));
  }
  return [];
};

const expandRecurrence = (
  rawComponent: ICalComponent | null | undefined,
  source: EventSourceRow,
  now: Date,
): NormalizedEvent[] => {
  const component = (rawComponent ?? {}) as ICalComponent;
  const startBase = toDate(component.start ?? component.dtstart);
  if (!startBase) return [];
  const { from, to } = clampDateRange(now, RECURRENCE_WINDOW_DAYS);
  const exdates = new Set<number>();
  const exDateContainer = component.exdate ?? component.exdates;
  if (exDateContainer && typeof exDateContainer === 'object') {
    Object.values(exDateContainer as Record<string, unknown>).forEach((value) => {
      const exdate = toDate(value);
      if (exdate) exdates.add(exdate.getTime());
    });
  }

  let durationMs: number | null = null;
  const durationCandidate = component.duration;
  if (typeof durationCandidate === 'number') {
    durationMs = durationCandidate;
  } else if (
    durationCandidate &&
    typeof durationCandidate === 'object' &&
    typeof durationCandidate.toMilliseconds === 'function'
  ) {
    durationMs = durationCandidate.toMilliseconds();
  }
  if (durationMs == null && component.end && startBase) {
    const end = toDate(component.end);
    if (end) {
      durationMs = end.getTime() - startBase.getTime();
    }
  }

  const status = toStatus(component.status as string | undefined);
  const title = cleanString(component.summary as string);
  const normalizedTitle = normaliseTitle(title);
  const description = parseDescription(component.description);
  const venue = cleanString((component.location as string) || source.venue_hint || '');
  const url = cleanString((component.url as string) || source.url);
  const tzCandidate = component.tz || component.tzid || component.timezone;
  let tz: string | null = null;
  if (typeof tzCandidate === 'string') {
    tz = tzCandidate;
  } else if (hasTzId(component.dtstart) && typeof component.dtstart.tzid === 'string') {
    tz = component.dtstart.tzid;
  }
  const startTz =
    (component.start && typeof component.start === 'object' && 'tz' in component.start
      ? (component.start as { tz?: unknown }).tz
      : null) ?? null;
  const tzHint = typeof startTz === 'string' ? startTz : tz;
  const isUtcZone = typeof tzHint === 'string' && tzHint.toLowerCase().includes('utc');
  const normalizeOccurrence = (occurrence: Date): Date => {
    if (!isUtcZone) return occurrence;
    const offsetMs = occurrence.getTimezoneOffset() * 60 * 1000;
    return new Date(occurrence.getTime() + offsetMs);
  };
  const tags = toTags(component.categories as unknown);
  const geo: ICalGeo = component.geo ?? {};
  const lat = parseMaybeNumber(geo.lat ?? geo.latitude);
  const lng = parseMaybeNumber(geo.lng ?? geo.lon ?? geo.longitude);
  const metadata = {
    uid: component.uid || null,
    source: 'ics',
  };

  const results: NormalizedEvent[] = [];

  if (component.rrule) {
    const between = component.rrule.between(from, to, true) as Date[];
    between.forEach((occurrenceRaw) => {
      const occurrence = normalizeOccurrence(occurrenceRaw);
      if (exdates.has(occurrenceRaw.getTime())) return;
      const end = durationMs != null
        ? new Date(occurrence.getTime() + durationMs)
        : component.end
          ? new Date(occurrence.getTime() + (toDate(component.end)!.getTime() - startBase.getTime()))
          : null;
      results.push({
        sourceId: source.id,
        sourceType: 'ics',
        sourceUrl: source.url,
        sourceUid: component.uid || null,
        title,
        normalizedTitle,
        description,
        url,
        imageUrl: null,
        status,
        startAt: occurrence,
        endAt: end ?? null,
        timezone: tz,
        venueName: venue || null,
        address: venue || null,
        lat: lat ?? null,
        lng: lng ?? null,
        tags,
        metadata,
      });
    });
  }

  if (!component.rrule) {
    const start = startBase;
    const end = toDate(component.end) ?? (durationMs != null ? new Date(start.getTime() + durationMs) : null);
    results.push({
      sourceId: source.id,
      sourceType: 'ics',
      sourceUrl: source.url,
      sourceUid: component.uid || null,
      title,
      normalizedTitle,
      description,
      url,
      imageUrl: null,
      status,
      startAt: start,
      endAt: end,
      timezone: tz,
      venueName: venue || null,
      address: venue || null,
      lat: lat ?? null,
      lng: lng ?? null,
      tags,
      metadata,
    });
  }

  return results.filter((event) => {
    const start = event.startAt.getTime();
    const pastCutoff = now.getTime() - PAST_GRACE_PERIOD_HOURS * 60 * 60 * 1000;
    return start >= pastCutoff && start <= to.getTime();
  });
};

export const parseIcsFeed = async (
  source: EventSourceRow,
  body: string,
  now: Date = nowUtc(),
): Promise<NormalizedEvent[]> => {
  const events: NormalizedEvent[] = [];
  let parsed: Record<string, ICalComponent>;
  try {
    type ICalModule = typeof ical & { sync?: { parseICS?: typeof ical.parseICS } };
    const syncParser = (ical as ICalModule).sync?.parseICS;
    const rawParsed = syncParser ? syncParser(body) : ical.parseICS(body);
    parsed = rawParsed as Record<string, ICalComponent>;
  } catch (error) {
    throw new Error(`Failed to parse ICS feed for ${source.url}: ${(error as Error).message}`);
  }

  Object.values(parsed).forEach((component) => {
    if (!component || (component.type !== 'VEVENT')) return;
    events.push(...expandRecurrence(component, source, now).map((event) => ({
      ...event,
      startAt: new Date(event.startAt.getTime()),
      endAt: event.endAt ? new Date(event.endAt.getTime()) : null,
    })));
  });

  // sort by start date and apply deterministic rounding to avoid duplicates due to floating ms
  return events
    .map((event) => ({
      ...event,
      startAt: new Date(roundToTenMinutes(event.startAt).getTime()),
      endAt: event.endAt ? new Date(event.endAt.getTime()) : null,
    }))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
};
