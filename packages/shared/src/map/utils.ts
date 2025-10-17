import type { MapActivitiesQuery, MapActivity, MapFeatureCollection, MapFilters } from './types';

export const DEFAULT_RADIUS_METERS = 2500;

const EMPTY_ARRAY: readonly string[] = Object.freeze([]);

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
