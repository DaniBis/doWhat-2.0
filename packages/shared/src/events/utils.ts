import { normalizeDiscoveryFilterContract } from '../discovery';
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

export const normalizeEventsQuery = (query: EventsQuery) => {
  const normalizedFilters = normalizeDiscoveryFilterContract({
    resultKinds: query.resultKinds,
    searchText: query.searchText,
    activityTypes: query.activityTypes,
    tags: [...(query.tags ?? []), ...(query.categories ?? [])],
    taxonomyCategories: query.taxonomyCategories,
    trustMode: query.trustMode ?? (query.verifiedOnly ? 'verified_only' : undefined),
  });

  return {
    sw: query.sw ? { lat: roundCoord(query.sw.lat), lng: roundCoord(query.sw.lng) } : null,
    ne: query.ne ? { lat: roundCoord(query.ne.lat), lng: roundCoord(query.ne.lng) } : null,
    from: query.from ?? null,
    to: query.to ?? null,
    limit: query.limit ?? null,
    filters: {
      resultKinds: normalizedFilters.resultKinds,
      searchText: normalizedFilters.searchText,
      activityTypes: normalizedFilters.activityTypes,
      tags: normalizedFilters.tags,
      taxonomyCategories: normalizedFilters.taxonomyCategories,
      trustMode: normalizedFilters.trustMode,
    },
    minAccuracy:
      typeof query.minAccuracy === 'number' && Number.isFinite(query.minAccuracy)
        ? Math.max(0, Math.min(100, Math.round(query.minAccuracy)))
        : null,
  } as const;
};

export const eventsQueryKey = (query: EventsQuery) => {
  const normalized = normalizeEventsQuery(query);
  return [
    'events',
    {
      sw: normalized.sw,
      ne: normalized.ne,
      from: normalized.from,
      to: normalized.to,
      resultKinds: normalized.filters.resultKinds,
      searchText: normalized.filters.searchText,
      activityTypes: normalized.filters.activityTypes,
      tags: normalized.filters.tags,
      taxonomyCategories: normalized.filters.taxonomyCategories,
      limit: normalized.limit,
      trustMode: normalized.filters.trustMode,
      minAccuracy: normalized.minAccuracy,
    },
  ] as const;
};
