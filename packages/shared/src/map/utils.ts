import type { EventSummary } from '../events/types';
import type { MapActivitiesQuery, MapActivity, MapFeatureCollection, MapFilters } from './types';

export const DEFAULT_RADIUS_METERS = 2500;

const sortStrings = (value?: string[] | null): string[] => {
  if (!value?.length) return [];
  return [...value].map((item) => item.trim()).filter(Boolean).sort();
};

export const normalizeFilters = (filters?: MapFilters): Required<MapFilters> => ({
  activityTypes: sortStrings(filters?.activityTypes) as string[],
  tags: sortStrings(filters?.tags) as string[],
  traits: sortStrings(filters?.traits) as string[],
});

export const mapActivitiesQueryKey = (query: MapActivitiesQuery) => {
  const normalized = normalizeFilters(query.filters);
  return [
    'mapActivities',
    {
      lat: Number(query.center.lat.toFixed(6)),
      lng: Number(query.center.lng.toFixed(6)),
      radiusMeters: Math.round(query.radiusMeters),
      limit: query.limit ?? null,
      activityTypes: normalized.activityTypes,
      tags: normalized.tags,
      traits: normalized.traits,
    },
  ] as const;
};

export const activitiesToFeatureCollection = (activities: MapActivity[]): MapFeatureCollection => ({
  type: 'FeatureCollection',
  features: activities
    .filter((activity) => Number.isFinite(activity.lat) && Number.isFinite(activity.lng))
    .map((activity) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [activity.lng, activity.lat],
      },
      properties: {
        kind: 'activity' as const,
        id: activity.id,
        name: activity.name,
        venue: activity.venue ?? null,
        price_cents: activity.price_cents ?? null,
        rating: activity.rating ?? null,
        rating_count: activity.rating_count ?? null,
        starts_at: activity.starts_at ?? null,
        activity_types: activity.activity_types ?? null,
        tags: activity.tags ?? null,
        traits: activity.traits ?? null,
        distance_m: activity.distance_m ?? null,
      },
    })),
});

export const activitiesToEventsFeatureCollection = (events: EventSummary[]): MapFeatureCollection => ({
  type: 'FeatureCollection',
  features: events
    .filter((event) => Number.isFinite(event.lat ?? NaN) && Number.isFinite(event.lng ?? NaN))
    .map((event) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [event.lng as number, event.lat as number],
      },
      properties: {
        kind: 'event' as const,
        id: event.id,
        title: event.title,
        start_at: event.start_at,
        end_at: event.end_at,
        venue_name: event.venue_name ?? null,
        url: event.url ?? null,
        status: event.status,
        tags: event.tags ?? null,
        place_id: event.place_id ?? null,
      },
    })),
});

export const serializeFiltersToSearchParams = (filters?: MapFilters): URLSearchParams => {
  const params = new URLSearchParams();
  const normalized = normalizeFilters(filters);
  if (normalized.activityTypes.length) params.set('types', normalized.activityTypes.join(','));
  if (normalized.tags.length) params.set('tags', normalized.tags.join(','));
  if (normalized.traits.length) params.set('traits', normalized.traits.join(','));
  return params;
};

export const mergeSearchParams = (base: URLSearchParams, extra: URLSearchParams) => {
  const clone = new URLSearchParams(base.toString());
  extra.forEach((value, key) => {
    clone.set(key, value);
  });
  return clone;
};

const SEED_MARKERS = new Set(['seed', 'demo-seed', 'dev-seed']);

export type SeedTaggable = {
  tags?: (string | null)[] | null;
  venue?: string | null;
};

const normalisePotentialTag = (value?: string | null) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

export const hasSeedMarker = (candidate: SeedTaggable | null | undefined): boolean => {
  if (!candidate) return false;
  const tagValues = (candidate.tags ?? []).map(normalisePotentialTag);
  if (tagValues.some((tag) => SEED_MARKERS.has(tag))) {
    return true;
  }
  const venue = normalisePotentialTag(candidate.venue);
  if (venue && (venue === 'seeded spot' || venue.endsWith('(seeded)'))) {
    return true;
  }
  return false;
};

export const filterOutSeedActivities = <T extends SeedTaggable>(items: readonly T[] | null | undefined): T[] => {
  if (!items?.length) return [];
  return items.filter((item) => !hasSeedMarker(item));
};
