import type { EventsQuery, EventSummary } from './types';

export const sortEventsByStart = (events: EventSummary[]): EventSummary[] =>
  [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

export const isEventActive = (event: EventSummary, now: Date = new Date()): boolean => {
  const start = new Date(event.start_at).getTime();
  const end = event.end_at ? new Date(event.end_at).getTime() : null;
  const ts = now.getTime();
  if (Number.isNaN(start)) return false;
  if (end != null && !Number.isNaN(end)) {
    return ts >= start && ts <= end;
  }
  return ts >= start;
};

export const formatEventTimeRange = (event: EventSummary): { start: Date; end?: Date } => {
  const start = new Date(event.start_at);
  const end = event.end_at ? new Date(event.end_at) : undefined;
  return { start, end };
};

const roundCoord = (value: number | undefined) => (typeof value === 'number' ? Number(value.toFixed(6)) : null);

const normaliseCategories = (categories?: string[] | null): string[] =>
  (categories ?? [])
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value))
    .sort();

export const eventsQueryKey = (query: EventsQuery) => {
  const categories = normaliseCategories(query.categories);
  return [
    'events',
    {
      sw: query.sw ? { lat: roundCoord(query.sw.lat), lng: roundCoord(query.sw.lng) } : null,
      ne: query.ne ? { lat: roundCoord(query.ne.lat), lng: roundCoord(query.ne.lng) } : null,
      from: query.from ?? null,
      to: query.to ?? null,
      categories,
      limit: query.limit ?? null,
    },
  ] as const;
};
