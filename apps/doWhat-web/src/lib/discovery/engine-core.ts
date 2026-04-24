import ngeohash from 'ngeohash';

import {
  normalizeDiscoveryFilterContract,
  type DiscoveryFilterContract,
  type NormalizedDiscoveryFilterContract,
} from '@dowhat/shared';
import type { CapacityFilterKey, TimeWindowKey } from '@dowhat/shared';

export type DiscoveryBounds = {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
};

export type DiscoveryFilters = DiscoveryFilterContract;
export type NormalizedDiscoveryFilters = NormalizedDiscoveryFilterContract;

export type DiscoveryItem = {
  id: string;
  name: string;
  venue?: string | null;
  place_id?: string | null;
  place_label?: string | null;
  website?: string | null;
  lat: number;
  lng: number;
  distance_m?: number | null;
  starts_at?: string | null;
  activity_types?: string[] | null;
  tags?: string[] | null;
  traits?: string[] | null;
  taxonomy_categories?: string[] | null;
  price_levels?: number[] | null;
  capacity_key?: CapacityFilterKey | null;
  time_window?: TimeWindowKey | null;
  upcoming_session_count?: number | null;
  source?: string | null;
  rating?: number | null;
  rating_count?: number | null;
  popularity_score?: number | null;
  source_confidence?: number | null;
  refreshed_at?: string | null;
  dedupe_key?: string | null;
  quality_confidence?: number | null;
  place_match_confidence?: number | null;
  trust_score?: number | null;
  verification_state?: 'suggested' | 'verified' | 'needs_votes';
  rank_score?: number | null;
  rank_breakdown?: {
    relevance: number;
    proximity: number;
    temporal: number;
    socialProof: number;
    quality: number;
  } | null;
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

export const EMPTY_DISCOVERY_FILTER_SUPPORT: DiscoveryFilterSupport = {
  activityTypes: false,
  tags: false,
  traits: false,
  taxonomyCategories: false,
  priceLevels: false,
  capacityKey: false,
  timeWindow: false,
};

export const FULL_DISCOVERY_FILTER_SUPPORT: DiscoveryFilterSupport = {
  activityTypes: true,
  tags: true,
  traits: true,
  taxonomyCategories: true,
  priceLevels: true,
  capacityKey: true,
  timeWindow: true,
};

export const mergeDiscoveryFilterSupport = (
  current: DiscoveryFilterSupport,
  next: DiscoveryFilterSupport,
): DiscoveryFilterSupport => ({
  activityTypes: current.activityTypes || next.activityTypes,
  tags: current.tags || next.tags,
  traits: current.traits || next.traits,
  taxonomyCategories: current.taxonomyCategories || next.taxonomyCategories,
  priceLevels: current.priceLevels || next.priceLevels,
  capacityKey: current.capacityKey || next.capacityKey,
  timeWindow: current.timeWindow || next.timeWindow,
});

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

export type DiscoveryDebug = {
  cacheHit: boolean;
  cacheKey: string;
  tilesTouched: string[];
  providerCounts: Record<string, number>;
  timings?: {
    cacheReadMs: number;
    taxonomyFetchMs: number;
    rpcFetchMs: number;
    fallbackFetchMs: number;
    seedRefreshMs: number;
    metadataHydrationMs: number;
    rankingAndGatingMs: number;
    placeHydrationMs: number;
    dedupeShieldMs: number;
    payloadShapeMs: number;
    totalMs: number;
  };
  pagesFetched: number;
  nextPageTokensUsed: number;
  itemsBeforeDedupe: number;
  itemsAfterDedupe: number;
  itemsAfterGates: number;
  itemsAfterFilters: number;
  dropReasons: Record<string, number>;
  candidateCounts: {
    afterRpc: number;
    afterFallbackMerge: number;
    afterMetadataFilter: number;
    afterPlaceGate: number;
    afterConfidenceGate: number;
    afterDedupe: number;
    final: number;
  };
  dropped: {
    notPlaceBacked: number;
    lowConfidence: number;
    genericLabels: number;
    deduped: number;
  };
  ranking: {
    enabled: boolean;
    placeMinConfidence: number;
  };
  searchProbe?: Array<{
    id: string;
    name: string;
    matchedBuckets: string[];
    evidenceSources: string[];
    survivedBy: string[];
  }>;
  stageItems?: {
    afterFallbackMerge?: Array<{
      id: string;
      placeId: string | null;
      name: string;
      placeLabel: string | null;
      source: string | null;
      activityTypes: string[];
      verificationState: 'suggested' | 'verified' | 'needs_votes' | null;
      placeMatchConfidence: number | null;
      qualityConfidence: number | null;
      lat: number;
      lng: number;
    }>;
    afterLaunchVisibility?: Array<{
      id: string;
      placeId: string | null;
      name: string;
      placeLabel: string | null;
      source: string | null;
      activityTypes: string[];
      verificationState: 'suggested' | 'verified' | 'needs_votes' | null;
      placeMatchConfidence: number | null;
      qualityConfidence: number | null;
      lat: number;
      lng: number;
    }>;
    afterMetadataFilter?: Array<{
      id: string;
      placeId: string | null;
      name: string;
      placeLabel: string | null;
      source: string | null;
      activityTypes: string[];
      verificationState: 'suggested' | 'verified' | 'needs_votes' | null;
      placeMatchConfidence: number | null;
      qualityConfidence: number | null;
      lat: number;
      lng: number;
    }>;
    afterConfidenceGate?: Array<{
      id: string;
      placeId: string | null;
      name: string;
      placeLabel: string | null;
      source: string | null;
      activityTypes: string[];
      verificationState: 'suggested' | 'verified' | 'needs_votes' | null;
      placeMatchConfidence: number | null;
      qualityConfidence: number | null;
      lat: number;
      lng: number;
    }>;
    afterDedupe?: Array<{
      id: string;
      placeId: string | null;
      name: string;
      placeLabel: string | null;
      source: string | null;
      activityTypes: string[];
      verificationState: 'suggested' | 'verified' | 'needs_votes' | null;
      placeMatchConfidence: number | null;
      qualityConfidence: number | null;
      lat: number;
      lng: number;
    }>;
    final?: Array<{
      id: string;
      placeId: string | null;
      name: string;
      placeLabel: string | null;
      source: string | null;
      activityTypes: string[];
      verificationState: 'suggested' | 'verified' | 'needs_votes' | null;
      placeMatchConfidence: number | null;
      qualityConfidence: number | null;
      lat: number;
      lng: number;
    }>;
  };
};

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
  providerCounts?: Record<string, number>;
  degraded?: boolean;
  fallbackError?: string;
  fallbackSource?: string;
  debug?: DiscoveryDebug;
};

const TILE_PRECISION = 6;
const MIN_RADIUS_METERS = 100;
const MAX_RADIUS_METERS = 100_000;
const DEFAULT_RADIUS_METERS = 2_000;

export const CACHE_TTL_MS = 5 * 60 * 1000;
export const MAX_CACHE_ENTRIES = 30;
export const MAX_CACHE_ITEMS = 2000;
const DISCOVERY_CACHE_KEY_VERSION = 4;

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

export const normalizeFilters = (filters?: DiscoveryFilters): NormalizedDiscoveryFilters =>
  normalizeDiscoveryFilterContract(filters);

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
    v: DISCOVERY_CACHE_KEY_VERSION,
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
