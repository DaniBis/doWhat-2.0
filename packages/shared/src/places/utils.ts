import type { PlaceSummary, PlacesViewportQuery } from './types';

export const placesQueryKey = (query: PlacesViewportQuery) => [
  'places',
  {
    sw: [query.bounds.sw.lat, query.bounds.sw.lng],
    ne: [query.bounds.ne.lat, query.bounds.ne.lng],
    categories: query.categories ?? [],
    limit: query.limit ?? null,
    city: query.city ?? null,
  },
];

export const debounce = <T extends (...args: Parameters<T>) => void>(fn: T, wait = 300) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
};

const parseTimestamp = (value?: string | null): number | null => {
  if (!value) return null;
  const date = new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
};

const pickMetadataTimestamp = (metadata: Record<string, unknown> | null | undefined): string | null => {
  if (!metadata) return null;
  const meta = metadata as Record<string, unknown>;
  const candidates: Array<unknown> = [
    meta.lastSeenAt,
    meta.last_seen_at,
    meta.last_seen,
    meta.updatedAt,
    meta.updated_at,
    meta.cacheRefreshedAt,
    meta.cache_refreshed_at,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return null;
};

const formatRelativeTime = (timestamp: number, now: number): string => {
  const diffSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSeconds < 60) return 'Updated just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `Updated ${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Updated ${diffHours} hr ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `Updated ${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `Updated ${diffMonths} mo ago`;
  const diffYears = Math.floor(diffMonths / 12);
  return `Updated ${diffYears} yr${diffYears === 1 ? '' : 's'} ago`;
};

export const formatPlaceUpdatedLabel = (
  place: PlaceSummary,
  options?: { now?: Date; fallback?: string },
): string => {
  const now = options?.now?.getTime() ?? Date.now();
  const fallback = options?.fallback ?? 'Updated recently';
  const candidates: Array<string | null | undefined> = [place.cachedAt, pickMetadataTimestamp(place.metadata)];
  for (const candidate of candidates) {
    const timestamp = parseTimestamp(candidate ?? undefined);
    if (timestamp != null) {
      return formatRelativeTime(timestamp, now);
    }
  }
  return fallback;
};
