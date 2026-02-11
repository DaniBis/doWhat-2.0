import ngeohash from 'ngeohash';

import type { CapacityFilterKey, TimeWindowKey } from '@dowhat/shared';

export type DiscoveryBounds = {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
};

export type DiscoveryFilters = {
  activityTypes?: string[];
  tags?: string[];
  traits?: string[];
  taxonomyCategories?: string[];
  priceLevels?: number[];
  capacityKey?: CapacityFilterKey;
  timeWindow?: TimeWindowKey;
};

export type NormalizedDiscoveryFilters = {
  activityTypes: string[];
  tags: string[];
  traits: string[];
  taxonomyCategories: string[];
  priceLevels: number[];
  capacityKey: CapacityFilterKey;
  timeWindow: TimeWindowKey;
};

export type DiscoveryItem = {
  id: string;
  name: string;
  venue?: string | null;
  place_id?: string | null;
  place_label?: string | null;
  lat: number;
  lng: number;
  distance_m?: number | null;
  activity_types?: string[] | null;
  tags?: string[] | null;
  traits?: string[] | null;
  taxonomy_categories?: string[] | null;
  price_levels?: number[] | null;
  capacity_key?: CapacityFilterKey | null;
  time_window?: TimeWindowKey | null;
  upcoming_session_count?: number | null;
  source?: string | null;
};

export type DiscoveryFilterSupport = {
  activityTypes: boolean;
  tags: boolean;
  traits: boolean;
  taxonomyCategories: boolean;
  priceLevels: boolean;
  capacityKey: boolean;
  timeWindow: boolean;
};

export type DiscoveryFacet = { value: string; count: number };

export type DiscoveryFacets = {
  activityTypes: DiscoveryFacet[];
  tags: DiscoveryFacet[];
  traits: DiscoveryFacet[];
  taxonomyCategories: DiscoveryFacet[];
  priceLevels: DiscoveryFacet[];
  capacityKey: DiscoveryFacet[];
  timeWindow: DiscoveryFacet[];
};

export type DiscoverySourceBreakdown = Record<string, number>;

export type DiscoveryQuery = {
  center: { lat: number; lng: number };
  radiusMeters: number;
  limit: number;
  filters?: DiscoveryFilters;
  bounds?: DiscoveryBounds | null;
};

export type DiscoveryResult = {
  center: { lat: number; lng: number };
  radiusMeters: number;
  count: number;
  items: DiscoveryItem[];
  filterSupport: DiscoveryFilterSupport;
  facets: DiscoveryFacets;
  sourceBreakdown: DiscoverySourceBreakdown;
  cache?: { key: string; hit: boolean };
  source?: string;
  degraded?: boolean;
  fallbackError?: string;
  fallbackSource?: string;
};

const TILE_PRECISION = 6;
const MIN_RADIUS_METERS = 100;
const MAX_RADIUS_METERS = 100_000;
const DEFAULT_RADIUS_METERS = 2_000;

export const CACHE_TTL_MS = 5 * 60 * 1000;
export const MAX_CACHE_ENTRIES = 30;
export const MAX_CACHE_ITEMS = 200;

const CAPACITY_KEYS = new Set<CapacityFilterKey>(['any', 'couple', 'small', 'medium', 'large']);
const TIME_WINDOW_KEYS = new Set<TimeWindowKey>(['any', 'open_now', 'morning', 'afternoon', 'evening', 'late']);

export const roundCoordinate = (value: number, precision = 6): number =>
  Number.isFinite(value) ? Number(value.toFixed(precision)) : 0;

export const sanitizeCoordinate = (value: number | string | null | undefined): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

export const normalizeRadius = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_RADIUS_METERS;
  return Math.min(Math.max(Math.round(value), MIN_RADIUS_METERS), MAX_RADIUS_METERS);
};

export const normalizeList = (values?: readonly (string | null | undefined)[] | null): string[] => {
  if (!values?.length) return [];
  const cleaned = values
    .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .filter(Boolean);
  return Array.from(new Set(cleaned)).sort((a, b) => a.localeCompare(b));
};

const normalizeNumberValues = (values?: readonly (number | null | undefined)[] | null): number[] => {
  if (!values?.length) return [];
  const cleaned = values
    .map((value) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null))
    .filter((value): value is number => value != null)
    .filter((value) => value >= 1 && value <= 4);
  return Array.from(new Set(cleaned)).sort((a, b) => a - b);
};

const normalizeCapacityKey = (value: unknown): CapacityFilterKey =>
  CAPACITY_KEYS.has(value as CapacityFilterKey) ? (value as CapacityFilterKey) : 'any';

const normalizeTimeWindow = (value: unknown): TimeWindowKey =>
  TIME_WINDOW_KEYS.has(value as TimeWindowKey) ? (value as TimeWindowKey) : 'any';

export const normalizeFilters = (filters?: DiscoveryFilters): NormalizedDiscoveryFilters => ({
  activityTypes: normalizeList(filters?.activityTypes ?? null),
  tags: normalizeList(filters?.tags ?? null),
  traits: normalizeList(filters?.traits ?? null),
  taxonomyCategories: normalizeList(filters?.taxonomyCategories ?? null),
  priceLevels: normalizeNumberValues(filters?.priceLevels ?? null),
  capacityKey: normalizeCapacityKey(filters?.capacityKey),
  timeWindow: normalizeTimeWindow(filters?.timeWindow),
});

export const computeTileKey = (center: { lat: number; lng: number }): string =>
  ngeohash.encode(center.lat, center.lng, TILE_PRECISION);

export const buildDiscoveryCacheKey = (kind: string, query: DiscoveryQuery): string => {
  const normalizedFilters = normalizeFilters(query.filters);
  const bounds = query.bounds
    ? {
        sw: {
          lat: roundCoordinate(query.bounds.sw.lat, 5),
          lng: roundCoordinate(query.bounds.sw.lng, 5),
        },
        ne: {
          lat: roundCoordinate(query.bounds.ne.lat, 5),
          lng: roundCoordinate(query.bounds.ne.lng, 5),
        },
      }
    : null;

  const payload = {
    kind,
    center: {
      lat: roundCoordinate(query.center.lat, 5),
      lng: roundCoordinate(query.center.lng, 5),
    },
    radiusMeters: normalizeRadius(query.radiusMeters),
    limit: query.limit ?? null,
    bounds,
    filters: normalizedFilters,
  };

  return JSON.stringify(payload);
};
