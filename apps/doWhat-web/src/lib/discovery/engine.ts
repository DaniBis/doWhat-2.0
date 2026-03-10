import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  DiscoveryFacets,
  DiscoveryFilterSupport,
  DiscoveryItem,
  NormalizedDiscoveryFilters,
  DiscoveryQuery,
  DiscoveryResult,
  DiscoveryDebug,
  DiscoverySourceBreakdown,
} from './engine-core';
import {
  CACHE_TTL_MS,
  EMPTY_DISCOVERY_FILTER_SUPPORT,
  FULL_DISCOVERY_FILTER_SUPPORT,
  MAX_CACHE_ENTRIES,
  MAX_CACHE_ITEMS,
  buildDiscoveryCacheKey,
  computeTileKey,
  mergeDiscoveryFilterSupport,
  normalizeFilters,
  normalizeList,
  normalizeRadius,
  roundCoordinate,
  sanitizeCoordinate,
} from './engine-core';
export { buildDiscoveryCacheKey } from './engine-core';
export type {
  DiscoveryBounds,
  DiscoveryFacet,
  DiscoveryFacets,
  DiscoveryFilterSupport,
  DiscoveryFilters,
  DiscoveryItem,
  NormalizedDiscoveryFilters,
  DiscoveryQuery,
  DiscoveryResult,
  DiscoveryDebug,
  DiscoverySourceBreakdown,
} from './engine-core';
import {
  ACTIVITY_CATALOG_PRESETS,
  countActiveDiscoveryFilters as countDiscoveryFilterFields,
  defaultDiscoveryTier3Index,
  evaluateActivityFirstDiscoveryPolicy,
  filterOutSeedActivities,
  hasSeedMarker,
  isUuid,
} from '@dowhat/shared';
import type { CapacityFilterKey, DiscoverySortMode, TimeWindowKey } from '@dowhat/shared';

import { db } from '@/lib/db';
import { resolveDiscoveryBounds } from '@/lib/discovery/bounds';
import { filterPlacesByActivityContract } from '@/lib/discovery/placeActivityFilter';
import { fetchPlacesForViewport } from '@/lib/places/aggregator';
import { rankDiscoveryItems } from '@/lib/discovery/ranking';
import { hydratePlaceLabel, normalizePlaceLabel, PLACE_FALLBACK_LABEL } from '@/lib/places/labels';
import { haversineMeters } from '@/lib/places/utils';
import { matchActivitiesForPlaces } from '@/lib/places/activityMatching';
import { getOptionalServiceClient } from '@/lib/supabase/service';
import { searchVenueActivities } from '@/lib/venues/search';
import type { ActivityName } from '@/lib/venues/constants';
import type { RankedVenueActivity } from '@/lib/venues/types';


const isMissingColumnError = (
  error: { code?: string | null; message?: string | null; hint?: string | null },
  columnName: string,
) => {
  if (!error) return false;
  const haystack = `${error.message ?? ''} ${error.hint ?? ''}`.toLowerCase();
  return haystack.includes(columnName.toLowerCase());
};

type DiscoveryCacheEntry = {
  cachedAt: string;
  expiresAt: string;
  items: DiscoveryItem[];
  filterSupport: DiscoveryFilterSupport;
  sourceBreakdown: DiscoverySourceBreakdown;
  source?: string;
  providerCounts?: Record<string, number>;
  explain?: DiscoveryExplainSnapshot;
  venues?: RankedVenueActivity[];
};

type DiscoveryCacheRecord = Record<string, DiscoveryCacheEntry>;

const extractCacheRecord = (value: unknown): DiscoveryCacheRecord => {
  if (!value || typeof value !== 'object') return {};
  if (Array.isArray(value)) return {};
  return value as DiscoveryCacheRecord;
};

let discoveryCacheUnavailable = false;
let warnedDiscoveryCacheUnavailable = false;

const disableDiscoveryCache = (reason: string) => {
  discoveryCacheUnavailable = true;
  if (!warnedDiscoveryCacheUnavailable) {
    console.warn(`[discovery] disabling tile cache persistence: ${reason}`);
    warnedDiscoveryCacheUnavailable = true;
  }
};

const readDiscoveryCache = async (
  client: SupabaseClient,
  tileKey: string,
  cacheKey: string,
): Promise<{ entry: DiscoveryCacheEntry | null; record: DiscoveryCacheRecord }> => {
  if (discoveryCacheUnavailable) {
    return { entry: null, record: {} };
  }
  try {
    const { data, error } = await client
      .from('place_tiles')
      .select('discovery_cache')
      .eq('geohash6', tileKey)
      .maybeSingle();

    if (error) {
      if (isMissingColumnError(error, 'discovery_cache')) {
        disableDiscoveryCache('missing place_tiles.discovery_cache column');
        return { entry: null, record: {} };
      }
      throw error;
    }

    const record = extractCacheRecord(data?.discovery_cache ?? null);
    const entry = record[cacheKey] ?? null;
    if (!entry?.expiresAt) return { entry: null, record };
    const expiresAt = new Date(entry.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      return { entry: null, record };
    }
    return { entry, record };
  } catch (error) {
    console.warn('[discovery] cache read failed', error);
    return { entry: null, record: {} };
  }
};

const pruneCacheRecord = (record: DiscoveryCacheRecord) => {
  const entries = Object.entries(record);
  if (entries.length <= MAX_CACHE_ENTRIES) return record;
  entries.sort((a, b) => {
    const aTime = new Date(a[1]?.cachedAt ?? 0).getTime();
    const bTime = new Date(b[1]?.cachedAt ?? 0).getTime();
    return aTime - bTime;
  });
  const trimmed = entries.slice(entries.length - MAX_CACHE_ENTRIES);
  return Object.fromEntries(trimmed);
};

const writeDiscoveryCache = async (
  client: SupabaseClient,
  tileKey: string,
  cacheKey: string,
  entry: DiscoveryCacheEntry,
  record: DiscoveryCacheRecord,
) => {
  if (discoveryCacheUnavailable) return;
  const nextRecord = pruneCacheRecord({ ...record, [cacheKey]: entry });
  try {
    const { error } = await client
      .from('place_tiles')
      .upsert({ geohash6: tileKey, discovery_cache: nextRecord }, { onConflict: 'geohash6' });
    if (error) throw error;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      isMissingColumnError(
        error as { code?: string | null; message?: string | null; hint?: string | null },
        'discovery_cache',
      )
    ) {
      disableDiscoveryCache('missing place_tiles.discovery_cache column');
      return;
    }
    console.warn('[discovery] cache write failed', error);
  }
};

const buildFacets = (items: DiscoveryItem[]): DiscoveryFacets => {
  const buildFacet = (values: Array<string | null | undefined>) => {
    const counts = new Map<string, number>();
    values.forEach((value) => {
      if (!value) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  };

  const activityTypes: string[] = [];
  const tags: string[] = [];
  const traits: string[] = [];
  const taxonomyCategories: string[] = [];
  const priceLevels: string[] = [];
  const capacityKeys: string[] = [];
  const timeWindows: string[] = [];

  items.forEach((item) => {
    (item.activity_types ?? []).forEach((value: string | null | undefined) => {
      if (typeof value === 'string') activityTypes.push(value);
    });
    (item.tags ?? []).forEach((value: string | null | undefined) => {
      if (typeof value === 'string') tags.push(value);
    });
    (item.traits ?? []).forEach((value: string | null | undefined) => {
      if (typeof value === 'string') traits.push(value);
    });
    (item.taxonomy_categories ?? []).forEach((value: string | null | undefined) => {
      if (typeof value === 'string') taxonomyCategories.push(value);
    });
    (item.price_levels ?? []).forEach((value: number | null | undefined) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        priceLevels.push(String(Math.round(value)));
      }
    });
    if (item.capacity_key) capacityKeys.push(item.capacity_key);
    if (item.time_window) timeWindows.push(item.time_window);
  });

  return {
    activityTypes: buildFacet(activityTypes),
    tags: buildFacet(tags),
    traits: buildFacet(traits),
    taxonomyCategories: buildFacet(taxonomyCategories),
    priceLevels: buildFacet(priceLevels),
    capacityKey: buildFacet(capacityKeys),
    timeWindow: buildFacet(timeWindows),
  };
};

const buildSourceBreakdown = (items: DiscoveryItem[]): DiscoverySourceBreakdown => {
  const breakdown: DiscoverySourceBreakdown = {};
  items.forEach((item) => {
    const key = item.source ?? 'unknown';
    breakdown[key] = (breakdown[key] ?? 0) + 1;
  });
  return breakdown;
};

const orderDiscoveryItems = (items: DiscoveryItem[], sortMode: DiscoverySortMode = 'rank') =>
  [...items].sort((a, b) => {
    if (sortMode === 'distance') {
      const distanceA = a.distance_m ?? Number.POSITIVE_INFINITY;
      const distanceB = b.distance_m ?? Number.POSITIVE_INFINITY;
      if (distanceA !== distanceB) return distanceA - distanceB;
      const nameOrder = a.name.localeCompare(b.name);
      if (nameOrder !== 0) return nameOrder;
      return a.id.localeCompare(b.id);
    }

    if (sortMode === 'name') {
      const nameOrder = a.name.localeCompare(b.name);
      if (nameOrder !== 0) return nameOrder;
      const distanceA = a.distance_m ?? Number.POSITIVE_INFINITY;
      const distanceB = b.distance_m ?? Number.POSITIVE_INFINITY;
      if (distanceA !== distanceB) return distanceA - distanceB;
      return a.id.localeCompare(b.id);
    }

    if (sortMode === 'soonest') {
      const timeA = a.starts_at ? new Date(a.starts_at).getTime() : Number.POSITIVE_INFINITY;
      const timeB = b.starts_at ? new Date(b.starts_at).getTime() : Number.POSITIVE_INFINITY;
      if (timeA !== timeB) return timeA - timeB;
    }

    const scoreA = a.rank_score ?? null;
    const scoreB = b.rank_score ?? null;
    if (scoreA != null || scoreB != null) {
      const safeA = scoreA ?? Number.NEGATIVE_INFINITY;
      const safeB = scoreB ?? Number.NEGATIVE_INFINITY;
      if (safeA !== safeB) return safeB - safeA;
    }
    const distanceA = a.distance_m ?? Number.POSITIVE_INFINITY;
    const distanceB = b.distance_m ?? Number.POSITIVE_INFINITY;
    if (distanceA !== distanceB) return distanceA - distanceB;
    const nameOrder = a.name.localeCompare(b.name);
    if (nameOrder !== 0) return nameOrder;
    return a.id.localeCompare(b.id);
  });

const computeDistanceFromCenter = (
  item: DiscoveryItem,
  center: { lat: number; lng: number },
): number | null => {
  if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) {
    return typeof item.distance_m === 'number' && Number.isFinite(item.distance_m) ? item.distance_m : null;
  }
  return haversineMeters(center.lat, center.lng, item.lat, item.lng);
};

const enforceDistanceWindow = (
  items: DiscoveryItem[],
  query: DiscoveryQuery,
): DiscoveryItem[] => {
  const epsilonMeters = 50;
  const maxDistance = query.radiusMeters + epsilonMeters;
  const result: DiscoveryItem[] = [];
  items.forEach((item) => {
    const distance = computeDistanceFromCenter(item, query.center);
    if (distance == null || !Number.isFinite(distance)) return;
    if (distance > maxDistance) return;
    result.push({
      ...item,
      distance_m: distance,
    });
  });
  return result;
};

const placeKeyForItem = (item: DiscoveryItem): string => {
  if (item.place_id) return `place:${item.place_id}`;
  const name = item.name ? item.name.trim().toLowerCase() : '';
  const lat = roundCoordinate(item.lat, 4);
  const lng = roundCoordinate(item.lng, 4);
  return `place:${name || 'unknown'}:${lat},${lng}`;
};

const normalizeDuplicateText = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const canonicalPlaceIdForDiscoveryItem = (item: DiscoveryItem): string | null => {
  const placeId = normalizeDuplicateText(item.place_id ?? null);
  if (!placeId) return null;
  const source = normalizeDuplicateText(item.source ?? null);
  const id = normalizeDuplicateText(item.id);
  if (source === 'supabase-venues' && id.startsWith('venue:')) {
    return null;
  }
  return placeId;
};

const duplicateLabelForDiscoveryItem = (item: DiscoveryItem): string =>
  normalizeDuplicateText(item.place_label) || normalizeDuplicateText(item.name) || normalizeDuplicateText(item.venue);

const discoverySourcePriority = (item: DiscoveryItem): number => {
  switch (item.source) {
    case 'supabase-places':
      return 5;
    case 'postgis':
      return 4;
    case 'activities':
      return 3;
    case 'venues':
      return 2;
    case 'supabase-venues':
      return 1;
    default:
      return 0;
  }
};

const discoveryDuplicateScore = (item: DiscoveryItem): number => {
  let score = 0;
  if (canonicalPlaceIdForDiscoveryItem(item)) score += 14;
  if (item.website) score += 4;
  score += discoverySourcePriority(item) * 3;
  score += (item.activity_types ?? []).filter(Boolean).length * 2;
  score += (item.taxonomy_categories ?? []).filter(Boolean).length * 2;
  score += (item.tags ?? []).filter(Boolean).length;
  if (typeof item.rating_count === 'number' && Number.isFinite(item.rating_count)) {
    score += Math.min(6, Math.log1p(Math.max(0, item.rating_count)));
  }
  if (typeof item.popularity_score === 'number' && Number.isFinite(item.popularity_score)) {
    score += Math.min(4, Math.log1p(Math.max(0, item.popularity_score)));
  }
  if (typeof item.source_confidence === 'number' && Number.isFinite(item.source_confidence)) {
    score += Math.max(0, Math.min(1, item.source_confidence)) * 4;
  }
  return score;
};

const mergeStringLists = (left?: string[] | null, right?: string[] | null): string[] | null => {
  const merged = new Set<string>();
  [...(left ?? []), ...(right ?? [])].forEach((value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed) merged.add(trimmed);
  });
  return merged.size ? Array.from(merged) : null;
};

const mergeVerificationState = (
  left?: DiscoveryItem['verification_state'],
  right?: DiscoveryItem['verification_state'],
): DiscoveryItem['verification_state'] => {
  const rank = { verified: 3, needs_votes: 2, suggested: 1 } as const;
  const leftRank = left ? rank[left] : 0;
  const rightRank = right ? rank[right] : 0;
  return leftRank >= rightRank ? (left ?? right) : right;
};

const areNearDuplicateDiscoveryItems = (
  existing: DiscoveryItem,
  candidate: DiscoveryItem,
  proximityMeters = 90,
): boolean => {
  const existingCanonical = canonicalPlaceIdForDiscoveryItem(existing);
  const candidateCanonical = canonicalPlaceIdForDiscoveryItem(candidate);
  if (existingCanonical && candidateCanonical) {
    return existingCanonical === candidateCanonical;
  }

  const existingLabel = duplicateLabelForDiscoveryItem(existing);
  const candidateLabel = duplicateLabelForDiscoveryItem(candidate);
  if (!existingLabel || !candidateLabel || existingLabel !== candidateLabel) return false;
  return haversineMeters(existing.lat, existing.lng, candidate.lat, candidate.lng) <= proximityMeters;
};

const mergeDiscoveryDuplicates = (
  existing: DiscoveryItem,
  candidate: DiscoveryItem,
): DiscoveryItem => {
  const preferred = discoveryDuplicateScore(candidate) > discoveryDuplicateScore(existing) ? candidate : existing;
  const duplicate = preferred === candidate ? existing : candidate;
  const canonicalOwner = canonicalPlaceIdForDiscoveryItem(preferred)
    ? preferred
    : canonicalPlaceIdForDiscoveryItem(duplicate)
      ? duplicate
      : preferred;

  return {
    ...duplicate,
    ...preferred,
    id: canonicalOwner.id,
    place_id: canonicalOwner.place_id ?? preferred.place_id ?? duplicate.place_id ?? null,
    name: preferred.name || duplicate.name,
    venue: preferred.venue ?? duplicate.venue ?? null,
    place_label: preferred.place_label ?? duplicate.place_label ?? null,
    website: preferred.website ?? duplicate.website ?? null,
    activity_types: mergeStringLists(preferred.activity_types, duplicate.activity_types),
    tags: mergeStringLists(preferred.tags, duplicate.tags),
    taxonomy_categories: mergeStringLists(preferred.taxonomy_categories, duplicate.taxonomy_categories),
    verification_state: mergeVerificationState(preferred.verification_state, duplicate.verification_state),
    rating: preferred.rating ?? duplicate.rating ?? null,
    rating_count: preferred.rating_count ?? duplicate.rating_count ?? null,
    popularity_score: preferred.popularity_score ?? duplicate.popularity_score ?? null,
    source_confidence: preferred.source_confidence ?? duplicate.source_confidence ?? null,
    distance_m:
      typeof preferred.distance_m === 'number' && typeof duplicate.distance_m === 'number'
        ? Math.min(preferred.distance_m, duplicate.distance_m)
        : preferred.distance_m ?? duplicate.distance_m ?? null,
    place_match_confidence: preferred.place_match_confidence ?? duplicate.place_match_confidence ?? null,
    quality_confidence: preferred.quality_confidence ?? duplicate.quality_confidence ?? null,
    trust_score: preferred.trust_score ?? duplicate.trust_score ?? null,
    rank_score: preferred.rank_score ?? duplicate.rank_score ?? null,
    refreshed_at: preferred.refreshed_at ?? duplicate.refreshed_at ?? null,
  };
};

const mergeActivitiesWithFallback = (
  primary: DiscoveryItem[],
  fallback: DiscoveryItem[],
): DiscoveryItem[] => {
  const result: DiscoveryItem[] = [];
  const seenIds = new Set<string>();

  [...primary, ...fallback].forEach((item) => {
    if (seenIds.has(item.id)) return;
    seenIds.add(item.id);

    const duplicateIndex = result.findIndex((existing) => {
      if (existing.id === item.id) return true;
      if (placeKeyForItem(existing) === placeKeyForItem(item)) return true;
      return areNearDuplicateDiscoveryItems(existing, item);
    });

    if (duplicateIndex < 0) {
      result.push(item);
      return;
    }

    result[duplicateIndex] = mergeDiscoveryDuplicates(result[duplicateIndex], item);
  });

  return result;
};

const dedupeByPlaceKey = (items: DiscoveryItem[]): DiscoveryItem[] => {
  const seen = new Set<string>();
  const result: DiscoveryItem[] = [];
  items.forEach((item) => {
    const key = placeKeyForItem(item);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
};

const PLACEHOLDER_NAME_PATTERNS = [
  /^unnamed(?:\s+(?:place|spot|venue|location))?$/i,
  /^unknown(?:\s+(?:place|spot|venue|location))?$/i,
  /^no\s*name$/i,
  /^n\/?a$/i,
  /^none$/i,
  /^null$/i,
];

const GENERIC_DISCOVERY_NAME_PATTERNS = [/^nearby\s+(?:spot|activity|venue)$/i, /^[a-z]+\s+spot$/i];

const hasMeaningfulDiscoveryDisplay = (item: Pick<DiscoveryItem, 'name' | 'place_label'>): boolean => {
  const name = normalizeDisplayCandidate(item.name);
  const placeLabel = normalizeDisplayCandidate(item.place_label ?? null);
  const meaningfulName = Boolean(name && !GENERIC_DISCOVERY_NAME_PATTERNS.some((pattern) => pattern.test(name)));
  const meaningfulPlace = Boolean(placeLabel && placeLabel !== PLACE_FALLBACK_LABEL);
  return meaningfulName || meaningfulPlace;
};

const normalizeDisplayCandidate = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_NAME_PATTERNS.some((pattern) => pattern.test(trimmed))) return null;
  return trimmed;
};

const humanizeToken = (value: string): string =>
  value
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const resolveDiscoveryDisplay = (input: {
  name?: string | null;
  venue?: string | null;
  placeLabel?: string | null;
  activityTypes?: string[] | null;
  tags?: string[] | null;
}): { name: string; placeLabel: string } => {
  const cleanName = normalizeDisplayCandidate(input.name);
  const cleanVenue = normalizeDisplayCandidate(input.venue);
  const cleanPlaceLabel = normalizeDisplayCandidate(input.placeLabel);

  const token =
    normalizeDisplayCandidate((input.activityTypes ?? [])[0] ?? null)
    ?? normalizeDisplayCandidate((input.tags ?? [])[0] ?? null);
  const derived = token ? `${humanizeToken(token)} spot` : null;

  const placeLabel = cleanPlaceLabel ?? cleanVenue ?? cleanName ?? derived ?? 'Nearby spot';
  const name = cleanName ?? cleanPlaceLabel ?? cleanVenue ?? derived ?? 'Nearby activity';

  return { name, placeLabel };
};

const prioritizeMeaningfulActivities = (items: DiscoveryItem[]): DiscoveryItem[] => {
  const meaningful: DiscoveryItem[] = [];
  const generic: DiscoveryItem[] = [];
  items.forEach((item) => {
    if (hasMeaningfulDiscoveryDisplay(item)) {
      meaningful.push(item);
      return;
    }
    generic.push(item);
  });
  return [...meaningful, ...generic];
};

const filterGenericActivities = (items: DiscoveryItem[]): DiscoveryItem[] =>
  items.filter((item) => hasMeaningfulDiscoveryDisplay(item));

const isPlaceBackedActivity = (item: DiscoveryItem): boolean => {
  if (!isUuid(item.place_id ?? null)) return false;
  if (isUuid(item.id)) return true;
  if (item.source === 'supabase-venues' && /^venue:/i.test(item.id)) {
    return true;
  }
  if (item.source === 'supabase-places' && /^place:/i.test(item.id)) {
    return true;
  }
  return false;
};

const ACTIVITY_PLACE_MIN_CONFIDENCE = 0.8;
const ACTIVITY_PLACE_MIN_CONFIDENCE_FILTERED = 0.55;
const ACTIVITY_PLACE_MIN_CONFIDENCE_RELAXED_INVENTORY = 0.62;
const ACTIVITY_PLACE_MIN_CONFIDENCE_FLOOR = 0.5;
const MIN_RESULTS_AFTER_GATES_INVENTORY = 500;
const MIN_RESULTS_AFTER_GATES_FILTERED = 24;
const SPARSE_CITY_BOOTSTRAP_MIN_RESULTS = 180;
const SPARSE_CITY_BOOTSTRAP_MAX_RADIUS_METERS = 5_000;
const SPARSE_INVENTORY_SEED_MIN_RESULTS = 24;
const SPARSE_INVENTORY_SEED_LIMIT_MAX = 900;

type DiscoverySeedMeta = {
  seeded: boolean;
  cacheHit: boolean;
  providerCounts: Record<string, number>;
  matcherRan: boolean;
  matcherError?: string | null;
  explain?: DiscoveryExplainSnapshot;
};

const createEmptyProviderCounts = (): Record<string, number> => ({
  openstreetmap: 0,
  foursquare: 0,
  google_places: 0,
});

type DiscoveryExplainSnapshot = {
  cacheHit: boolean;
  cacheKey: string;
  tilesTouched: string[];
  pagesFetched: number;
  nextPageTokensUsed: number;
  itemsBeforeDedupe: number;
  itemsAfterDedupe: number;
  itemsAfterGates: number;
  itemsAfterFilters: number;
  dropReasons: Record<string, number>;
};

const emptyExplainSnapshot = (cacheKey: string, tileKey: string): DiscoveryExplainSnapshot => ({
  cacheHit: false,
  cacheKey,
  tilesTouched: [tileKey],
  pagesFetched: 0,
  nextPageTokensUsed: 0,
  itemsBeforeDedupe: 0,
  itemsAfterDedupe: 0,
  itemsAfterGates: 0,
  itemsAfterFilters: 0,
  dropReasons: {},
});

const mergeNumericMap = (
  target: Record<string, number>,
  source: Record<string, number> | null | undefined,
) => {
  if (!source) return target;
  Object.entries(source).forEach(([key, value]) => {
    if (!Number.isFinite(value)) return;
    target[key] = (target[key] ?? 0) + Math.max(0, Number(value));
  });
  return target;
};

const discoveryDebugRollup = {
  requests: 0,
  cacheHits: 0,
  dedupeInput: 0,
  dedupeDropped: 0,
};

const shouldPrintDebugMetrics = (enabled?: boolean): boolean =>
  process.env.NODE_ENV !== 'production' && Boolean(enabled || process.env.DISCOVERY_DEBUG_METRICS === '1');

const logDiscoveryDebugMetrics = (input: {
  enabled?: boolean;
  cacheHit: boolean;
  dedupeInput: number;
  dedupeDropped: number;
  providerCounts?: Record<string, number> | null;
  source: string | null | undefined;
  reason: string;
  filterDrops?: {
    notPlaceBacked: number;
    lowConfidence: number;
    genericLabels: number;
    deduped: number;
  } | null;
}) => {
  if (!shouldPrintDebugMetrics(input.enabled)) return;
  discoveryDebugRollup.requests += 1;
  if (input.cacheHit) discoveryDebugRollup.cacheHits += 1;
  discoveryDebugRollup.dedupeInput += Math.max(0, input.dedupeInput);
  discoveryDebugRollup.dedupeDropped += Math.max(0, input.dedupeDropped);

  const cacheHitRate = discoveryDebugRollup.requests > 0
    ? discoveryDebugRollup.cacheHits / discoveryDebugRollup.requests
    : 0;
  const dedupeDropRate = discoveryDebugRollup.dedupeInput > 0
    ? discoveryDebugRollup.dedupeDropped / discoveryDebugRollup.dedupeInput
    : 0;

  console.info('[discovery.debug.metrics]', JSON.stringify({
    reason: input.reason,
    source: input.source ?? null,
    providerCounts: input.providerCounts ?? createEmptyProviderCounts(),
    cacheHit: input.cacheHit,
    cacheHitRate: Number(cacheHitRate.toFixed(4)),
    dedupeDropRate: Number(dedupeDropRate.toFixed(4)),
    dedupeDropped: Math.max(0, input.dedupeDropped),
    dedupeInput: Math.max(0, input.dedupeInput),
    filterDrops: input.filterDrops ?? null,
  }));
};

const CITY_BOOTSTRAP_CENTERS: Array<{ slug: string; lat: number; lng: number }> = [
  { slug: 'bangkok', lat: 13.7563, lng: 100.5018 },
  { slug: 'hanoi', lat: 21.0278, lng: 105.8342 },
  { slug: 'bucharest', lat: 44.4268, lng: 26.1025 },
];

const inferBootstrapCitySlug = (center: { lat: number; lng: number }): string | undefined => {
  let nearestSlug: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of CITY_BOOTSTRAP_CENTERS) {
    const distance = haversineMeters(center.lat, center.lng, candidate.lat, candidate.lng);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestSlug = candidate.slug;
    }
  }
  if (!nearestSlug) return undefined;
  // Avoid assigning an unrelated city slug for far-away coordinates.
  if (nearestDistance > 120_000) return undefined;
  return nearestSlug;
};

const hasActiveDiscoveryFilters = (filters: NormalizedDiscoveryFilters): boolean =>
  countDiscoveryFilterFields(filters) > 0;

const hasTypeOrTagDiscoveryFilters = (filters: NormalizedDiscoveryFilters): boolean => {
  return filters.activityTypes.length > 0 || filters.tags.length > 0;
};

const maybeBootstrapSparseCityPlaces = async (
  query: DiscoveryQuery,
  filters: NormalizedDiscoveryFilters,
  currentCount: number,
): Promise<DiscoverySeedMeta | null> => {
  if (currentCount >= SPARSE_CITY_BOOTSTRAP_MIN_RESULTS) return null;
  if (query.radiusMeters > SPARSE_CITY_BOOTSTRAP_MAX_RADIUS_METERS) return null;
  if (hasActiveDiscoveryFilters(filters)) return null;

  const bounds = resolveDiscoveryBounds(query);
  const inferredCity = inferBootstrapCitySlug(query.center);
  const forceLimit = Math.min(
    SPARSE_INVENTORY_SEED_LIMIT_MAX,
    Math.max(Math.min(query.limit * 6, 750), 300),
  );

  try {
    const seeded = await fetchPlacesForViewport({
      bounds,
      limit: forceLimit,
      forceRefresh: false,
      city: inferredCity,
      explain: true,
    });
    let matcherRan = false;
    let matcherError: string | null = null;
    try {
      const shouldRunMatcher = !seeded.cacheHit && currentCount < SPARSE_INVENTORY_SEED_MIN_RESULTS;
      if (shouldRunMatcher) {
        matcherRan = true;
        await matchActivitiesForPlaces({
          limit: Math.min(500, Math.max(query.limit * 5, 180)),
          city: inferredCity,
        });
      }
    } catch (error) {
      matcherError = error instanceof Error ? error.message : String(error);
      console.warn('[nearby] sparse-city activity matcher failed', error);
    }

    return {
      seeded: true,
      cacheHit: seeded.cacheHit,
      providerCounts: seeded.providerCounts,
      matcherRan,
      matcherError,
      explain: seeded.explain
        ? {
            cacheHit: seeded.explain.cacheHit,
            cacheKey: seeded.explain.cacheKey,
            tilesTouched: seeded.explain.tilesTouched,
            pagesFetched: seeded.explain.pagesFetched,
            nextPageTokensUsed: seeded.explain.nextPageTokensUsed,
            itemsBeforeDedupe: seeded.explain.itemsBeforeDedupe,
            itemsAfterDedupe: seeded.explain.itemsAfterDedupe,
            itemsAfterGates: seeded.explain.itemsAfterGates,
            itemsAfterFilters: seeded.explain.itemsAfterFilters,
            dropReasons: seeded.explain.dropReasons,
          }
        : undefined,
    };
  } catch (error) {
    console.warn('[nearby] sparse-city bootstrap failed', error);
    return {
      seeded: false,
      cacheHit: false,
      providerCounts: createEmptyProviderCounts(),
      matcherRan: false,
      matcherError: error instanceof Error ? error.message : String(error),
    };
  }
};

const maybeSeedViewportInventory = async (
  query: DiscoveryQuery,
  filters: NormalizedDiscoveryFilters,
  currentCount: number,
): Promise<DiscoverySeedMeta | null> => {
  const hasFilters = hasActiveDiscoveryFilters(filters);
  const sparseThreshold = hasFilters
    ? Math.max(8, Math.ceil(query.limit * 0.35))
    : Math.max(SPARSE_INVENTORY_SEED_MIN_RESULTS, Math.ceil(query.limit * 0.6));
  if (currentCount >= sparseThreshold) return null;

  const bounds = resolveDiscoveryBounds(query);
  const inferredCity = inferBootstrapCitySlug(query.center);
  const forceLimit = Math.min(
    SPARSE_INVENTORY_SEED_LIMIT_MAX,
    Math.max(Math.min(query.limit * 8, 900), 240),
  );

  try {
    const seeded = await fetchPlacesForViewport({
      bounds,
      limit: forceLimit,
      forceRefresh: false,
      city: inferredCity,
      explain: true,
    });
    let matcherRan = false;
    let matcherError: string | null = null;
    try {
      if (!seeded.cacheHit) {
        matcherRan = true;
        await matchActivitiesForPlaces({
          limit: Math.min(500, Math.max(query.limit * 6, 200)),
          city: inferredCity,
        });
      }
    } catch (error) {
      matcherError = error instanceof Error ? error.message : String(error);
      console.warn('[nearby] viewport activity matcher failed', error);
    }

    return {
      seeded: true,
      cacheHit: seeded.cacheHit,
      providerCounts: seeded.providerCounts,
      matcherRan,
      matcherError,
      explain: seeded.explain
        ? {
            cacheHit: seeded.explain.cacheHit,
            cacheKey: seeded.explain.cacheKey,
            tilesTouched: seeded.explain.tilesTouched,
            pagesFetched: seeded.explain.pagesFetched,
            nextPageTokensUsed: seeded.explain.nextPageTokensUsed,
            itemsBeforeDedupe: seeded.explain.itemsBeforeDedupe,
            itemsAfterDedupe: seeded.explain.itemsAfterDedupe,
            itemsAfterGates: seeded.explain.itemsAfterGates,
            itemsAfterFilters: seeded.explain.itemsAfterFilters,
            dropReasons: seeded.explain.dropReasons,
          }
        : undefined,
    };
  } catch (error) {
    console.warn('[nearby] viewport inventory seed failed', error);
    return {
      seeded: false,
      cacheHit: false,
      providerCounts: createEmptyProviderCounts(),
      matcherRan: false,
      matcherError: error instanceof Error ? error.message : String(error),
    };
  }
};

const filterByQuery = (
  items: DiscoveryItem[],
  filters: NormalizedDiscoveryFilters,
  support: DiscoveryFilterSupport,
) => {
  const searchText = filters.searchText;
  const wantTypes = support.activityTypes ? normalizeList(filters.activityTypes) : [];
  const wantTags = support.tags ? normalizeList(filters.tags) : [];
  const wantTraits = support.traits ? normalizeList(filters.peopleTraits) : [];
  const wantCategories = support.taxonomyCategories ? normalizeList(filters.taxonomyCategories) : [];
  const wantPrices: number[] = support.priceLevels ? filters.priceLevels : [];
  const wantCapacity = support.capacityKey && filters.capacityKey !== 'any' ? filters.capacityKey : null;
  const wantTimeWindow = support.timeWindow && filters.timeWindow !== 'any' ? filters.timeWindow : null;
  const trustMode = filters.trustMode;

  if (
    !searchText &&
    !wantTypes.length &&
    !wantTags.length &&
    !wantTraits.length &&
    !wantCategories.length &&
    !wantPrices.length &&
    !wantCapacity &&
    !wantTimeWindow &&
    trustMode === 'all'
  ) {
    return items;
  }

  return items.filter((item) => {
    if (searchText) {
      const haystack = [
        item.name,
        item.venue ?? '',
        item.place_label ?? '',
        ...(item.activity_types ?? []),
        ...(item.tags ?? []),
        ...(item.taxonomy_categories ?? []),
      ]
        .join(' ')
        .toLowerCase();
      const searchTokens = searchText.split(/[^a-z0-9]+/g).filter(Boolean);
      if (!haystack.includes(searchText) && !searchTokens.every((token) => haystack.includes(token))) {
        return false;
      }
    }

    if (trustMode === 'verified_only' && item.verification_state !== 'verified') return false;
    if (trustMode === 'ai_only' && item.verification_state !== 'suggested') return false;

    const types = normalizeList(item.activity_types ?? null);
    const tags = normalizeList(item.tags ?? null);
    const traits = normalizeList(item.traits ?? null);
    const categories = normalizeList(item.taxonomy_categories ?? null);
    const priceLevels = normalizeNumberValues(item.price_levels ?? undefined);
    const capacityKey = item.capacity_key ?? null;
    const timeWindow = item.time_window ?? null;
    if (wantTypes.length && !wantTypes.some((value: string) => types.includes(value))) return false;
    if (wantTags.length && !wantTags.some((value: string) => tags.includes(value))) return false;
    if (wantTraits.length && !wantTraits.some((value: string) => traits.includes(value))) return false;
    if (wantCategories.length && !wantCategories.some((value: string) => categories.includes(value))) return false;
    if (wantPrices.length && !wantPrices.some((value: number) => priceLevels.includes(value))) return false;
    if (wantCapacity && capacityKey !== wantCapacity) return false;
    if (wantTimeWindow && timeWindow !== wantTimeWindow) return false;
    return true;
  });
};

const toExplainSnapshot = (result: DiscoveryResult): DiscoveryExplainSnapshot | undefined => {
  const debug = result.debug;
  if (!debug) return undefined;
  return {
    cacheHit: debug.cacheHit,
    cacheKey: debug.cacheKey,
    tilesTouched: debug.tilesTouched,
    pagesFetched: debug.pagesFetched,
    nextPageTokensUsed: debug.nextPageTokensUsed,
    itemsBeforeDedupe: debug.itemsBeforeDedupe,
    itemsAfterDedupe: debug.itemsAfterDedupe,
    itemsAfterGates: debug.itemsAfterGates,
    itemsAfterFilters: debug.itemsAfterFilters,
    dropReasons: debug.dropReasons,
  };
};

const ensureCacheEntry = (result: DiscoveryResult, venues?: RankedVenueActivity[]): DiscoveryCacheEntry => {
  const cachedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
  return {
    cachedAt,
    expiresAt,
    items: result.items.slice(0, MAX_CACHE_ITEMS),
    filterSupport: result.filterSupport,
    sourceBreakdown: result.sourceBreakdown,
    source: result.source,
    providerCounts: result.providerCounts,
    explain: toExplainSnapshot(result),
    venues: venues?.slice(0, MAX_CACHE_ITEMS),
  };
};

const buildCacheResult = (
  entry: DiscoveryCacheEntry,
  query: DiscoveryQuery,
  cacheKey: string,
): DiscoveryResult => {
  const normalizedFilters = normalizeFilters(query.filters);
  const filteredItems = filterByQuery(entry.items, normalizedFilters, entry.filterSupport);
  const radiusBound = enforceDistanceWindow(filteredItems, query);
  const limited = orderDiscoveryItems(radiusBound, normalizedFilters.sortMode).slice(0, query.limit);
  return {
    center: query.center,
    radiusMeters: normalizeRadius(query.radiusMeters),
    count: limited.length,
    items: limited,
    filterSupport: entry.filterSupport,
    facets: buildFacets(limited),
    sourceBreakdown: buildSourceBreakdown(limited),
    source: entry.source,
    providerCounts: entry.providerCounts,
    cache: { key: cacheKey, hit: true },
  };
};

const displayStringList = (values?: (string | null)[] | null): string[] | null => {
  const entries = (values ?? [])
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is string => Boolean(value));
  return entries.length ? entries : null;
};

type RpcNearbyRow = {
  id: string;
  name: string;
  venue: string | null;
  place_id?: string | null;
  place_label?: string | null;
  lat?: number;
  lng?: number;
  lat_out?: number;
  lng_out?: number;
  distance_m?: number;
  activity_types?: string[] | null;
  tags?: string[] | null;
  traits?: string[] | null;
};

type NearbyActivityRow = {
  id: string;
  name: string;
  venue: string | null;
  place_id?: string | null;
  place_label?: string | null;
  lat: number | null;
  lng: number | null;
  activity_types?: string[] | null;
  tags?: string[] | null;
  traits?: string[] | null;
  participant_preferences?: { preferred_traits: string[] | null }[] | null;
};

type VenueFallbackRow = {
  id: string | null;
  name: string | null;
  address: string | null;
  lat: number | string | null;
  lng: number | string | null;
  website?: string | null;
  ai_activity_tags?: string[] | null;
  verified_activities?: string[] | null;
  updated_at?: string | null;
};

type PlaceFallbackRow = {
  id: string | null;
  name: string | null;
  address: string | null;
  lat: number | string | null;
  lng: number | string | null;
  website?: string | null;
  rating?: number | null;
  tags?: string[] | null;
  categories?: string[] | null;
  rating_count?: number | null;
  popularity_score?: number | null;
  source_confidence?: number | null;
  cached_at?: string | null;
  updated_at?: string | null;
};

type UpcomingSessionRow = {
  activity_id: string | null;
};

type VenueActivityMatchRow = {
  venue_id: string;
  activity_id: number;
  confidence: number | null;
  source: 'manual' | 'category' | 'keyword';
};

type ActivityCatalogLookupRow = {
  id: number;
  slug: string;
  name: string;
  keywords: string[] | null;
};

type PlaceActivityInference = {
  activityTypes: string[] | null;
  taxonomyCategories: string[] | null;
  structuredActivityTypes: string[] | null;
  structuredTaxonomyCategories: string[] | null;
  maxConfidence: number | null;
  hasVenueActivityMapping: boolean;
  hasManualOverride: boolean;
  verificationState: 'suggested' | 'verified' | 'needs_votes';
};

const addToSetMap = (map: Map<string, Set<string>>, key: string, value: string) => {
  const bucket = map.get(key) ?? new Set<string>();
  bucket.add(value);
  map.set(key, bucket);
};

const tokenizeForTaxonomyLookup = (value: string): string[] => {
  const normalized = normalizeActivityToken(value);
  if (!normalized) return [];
  const tokens = [normalized];
  normalized
    .split(' ')
    .filter((part) => part.length >= 4)
    .forEach((part) => tokens.push(part));
  return Array.from(new Set(tokens));
};

const TAXONOMY_TOKEN_MAP = (() => {
  const map = new Map<string, Set<string>>();
  defaultDiscoveryTier3Index.forEach((entry) => {
    [entry.id, entry.label, ...(entry.tags ?? [])].forEach((value) => {
      tokenizeForTaxonomyLookup(value).forEach((token) => {
        addToSetMap(map, token, entry.id);
      });
    });
  });
  return map;
})();

const inferTaxonomyCategoriesFromTokens = (values: Array<string | null | undefined>): string[] | null => {
  const found = new Set<string>();
  values.forEach((value) => {
    if (!value || typeof value !== 'string') return;
    tokenizeForTaxonomyLookup(value).forEach((token) => {
      const matches = TAXONOMY_TOKEN_MAP.get(token);
      if (!matches) return;
      matches.forEach((id) => found.add(id));
    });
  });
  if (!found.size) return null;
  return Array.from(found).sort((a, b) => a.localeCompare(b));
};

const normalizeCatalogEntry = (entry: ActivityCatalogLookupRow): ActivityCatalogLookupRow => ({
  ...entry,
  keywords: Array.isArray(entry.keywords) ? entry.keywords : [],
});

const loadActivityCatalogLookup = async (client: SupabaseClient): Promise<ActivityCatalogLookupRow[]> => {
  try {
    const { data, error } = await client
      .from('activity_catalog')
      .select('id,slug,name,keywords')
      .order('id', { ascending: true })
      .returns<ActivityCatalogLookupRow[]>();
    if (error) throw error;
    if (Array.isArray(data) && data.length) {
      return data.map(normalizeCatalogEntry);
    }
  } catch (error) {
    const isMissing =
      error != null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string | null }).code === '42P01';
    if (!isMissing) {
      console.warn('[discovery] failed loading activity catalog lookup', error);
    }
  }

  return ACTIVITY_CATALOG_PRESETS.map((entry) => ({
    id: entry.id,
    slug: entry.slug,
    name: entry.name,
    keywords: entry.keywords ?? [],
  }));
};

const loadPlaceActivityInferences = async (
  client: SupabaseClient,
  placeIds: string[],
): Promise<Map<string, PlaceActivityInference>> => {
  const map = new Map<string, PlaceActivityInference>();
  if (!placeIds.length) return map;

  try {
    const uniquePlaceIds = Array.from(new Set(placeIds.filter(Boolean)));
    const chunkSize = 180;
    const rows: VenueActivityMatchRow[] = [];
    for (let index = 0; index < uniquePlaceIds.length; index += chunkSize) {
      const chunk = uniquePlaceIds.slice(index, index + chunkSize);
      if (!chunk.length) continue;
      const { data: matchRows, error: matchError } = await client
        .from('venue_activities')
        .select('venue_id,activity_id,confidence,source')
        .in('venue_id', chunk)
        .returns<VenueActivityMatchRow[]>();
      if (matchError) throw matchError;
      if (matchRows?.length) {
        rows.push(...matchRows);
      }
    }
    if (!rows.length) return map;

    const catalog = await loadActivityCatalogLookup(client);
    const catalogById = new Map<number, ActivityCatalogLookupRow>(
      catalog.map((entry) => [entry.id, normalizeCatalogEntry(entry)]),
    );

    const grouped = new Map<string, VenueActivityMatchRow[]>();
    rows.forEach((row) => {
      const bucket = grouped.get(row.venue_id) ?? [];
      bucket.push(row);
      grouped.set(row.venue_id, bucket);
    });

    grouped.forEach((activityRows, placeId) => {
      const activityTypes = new Set<string>();
      const taxonomy = new Set<string>();
      const structuredActivityTypes = new Set<string>();
      const structuredTaxonomy = new Set<string>();
      let maxConfidence: number | null = null;
      let hasManual = false;
      let hasStructuredMapping = false;

      activityRows.forEach((row) => {
        const activity = catalogById.get(row.activity_id);
        if (!activity) return;
        activityTypes.add(activity.slug);
        const inferredTaxonomy = inferTaxonomyCategoriesFromTokens([
          activity.slug,
          activity.name,
          ...(activity.keywords ?? []),
        ]);
        inferredTaxonomy?.forEach((taxonomyId) => taxonomy.add(taxonomyId));
        if (row.source === 'manual' || row.source === 'category') {
          structuredActivityTypes.add(activity.slug);
          inferredTaxonomy?.forEach((taxonomyId) => structuredTaxonomy.add(taxonomyId));
          hasStructuredMapping = true;
        }
        if (row.source === 'manual') hasManual = true;
        if (typeof row.confidence === 'number' && Number.isFinite(row.confidence)) {
          maxConfidence = maxConfidence == null ? row.confidence : Math.max(maxConfidence, row.confidence);
        }
      });

      const verificationState: PlaceActivityInference['verificationState'] = hasManual
        ? 'verified'
        : (maxConfidence ?? 0) >= 0.72
          ? 'needs_votes'
          : 'suggested';

      map.set(placeId, {
        activityTypes: activityTypes.size ? Array.from(activityTypes).sort((a, b) => a.localeCompare(b)) : null,
        taxonomyCategories: taxonomy.size ? Array.from(taxonomy).sort((a, b) => a.localeCompare(b)) : null,
        structuredActivityTypes: structuredActivityTypes.size
          ? Array.from(structuredActivityTypes).sort((a, b) => a.localeCompare(b))
          : null,
        structuredTaxonomyCategories: structuredTaxonomy.size
          ? Array.from(structuredTaxonomy).sort((a, b) => a.localeCompare(b))
          : null,
        maxConfidence,
        hasVenueActivityMapping: hasStructuredMapping,
        hasManualOverride: hasManual,
        verificationState,
      });
    });
  } catch (error) {
    const isTableMissing =
      error != null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string | null }).code === '42P01';
    if (!isTableMissing) {
      console.warn('[discovery] failed loading place activity inferences', error);
    }
  }

  return map;
};

const toMapActivityFromVenue = (
  row: VenueFallbackRow,
  origin: { lat: number; lng: number },
): DiscoveryItem | null => {
  if (!row?.id) return null;
  const lat = sanitizeCoordinate(row.lat);
  const lng = sanitizeCoordinate(row.lng);
  if (lat == null || lng == null) return null;
  const verifiedTypes = displayStringList(row.verified_activities ?? null);
  const aiTags = displayStringList(row.ai_activity_tags ?? null);
  const inferredTypes = Array.from(new Set([...(verifiedTypes ?? []), ...(aiTags ?? [])]));
  const taxonomyCategories = inferTaxonomyCategoriesFromTokens([
    row.name,
    row.address,
    ...(verifiedTypes ?? []),
    ...(aiTags ?? []),
  ]);
  const eligibility = evaluateActivityFirstDiscoveryPolicy({
    name: row.name,
    description: row.address ?? null,
    activityTypes: verifiedTypes,
    taxonomyCategories,
    verifiedActivities: verifiedTypes,
  });
  if (!eligibility.isEligible) return null;
  const verificationState: DiscoveryItem['verification_state'] = verifiedTypes?.length
    ? 'verified'
    : aiTags?.length
      ? 'needs_votes'
      : 'suggested';
  const resolved = resolveDiscoveryDisplay({
    name: row.name,
    venue: row.address,
    placeLabel: normalizePlaceLabel(row.name, row.address),
    activityTypes: inferredTypes,
    tags: aiTags,
  });
  return {
    id: `venue:${row.id}`,
    name: resolved.name,
    venue: row.address ?? null,
    place_id: row.id,
    place_label: resolved.placeLabel,
    website: row.website ?? null,
    lat,
    lng,
    distance_m: haversineMeters(origin.lat, origin.lng, lat, lng),
    activity_types: inferredTypes.length ? inferredTypes : null,
    tags: aiTags,
    traits: null,
    taxonomy_categories: taxonomyCategories,
    verification_state: verificationState,
    refreshed_at: row.updated_at ?? null,
    source: 'supabase-venues',
  };
};

const fetchVenueFallbackActivities = async (
  client: SupabaseClient,
  query: DiscoveryQuery,
  limit: number,
) => {
  const bounds = resolveDiscoveryBounds(query);
  const swLat = bounds.sw.lat;
  const neLat = bounds.ne.lat;
  const swLng = bounds.sw.lng;
  const neLng = bounds.ne.lng;
  const baseColumns = ['id', 'name', 'address', 'lat', 'lng'];
  let includeTags = true;
  let includeVerified = true;
  let includeUpdatedAt = true;
  let includeWebsite = true;
  const buildVenueQuery = () => {
    const columns = [...baseColumns];
    if (includeWebsite) columns.push('website');
    if (includeTags) columns.push('ai_activity_tags');
    if (includeVerified) columns.push('verified_activities');
    if (includeUpdatedAt) columns.push('updated_at');
    let queryBuilder = client
      .from('venues')
      .select(columns.join(','))
      .gte('lat', swLat)
      .lte('lat', neLat)
      .gte('lng', swLng)
      .lte('lng', neLng)
      .limit(Math.max(limit * 2, 40))
      .returns<VenueFallbackRow[]>();
    if (includeUpdatedAt) {
      queryBuilder = queryBuilder.order('updated_at', { ascending: false });
    }
    return queryBuilder;
  };

  let data: VenueFallbackRow[] | null = null;
  let error: { code?: string | null; message?: string | null; hint?: string | null } | null = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await buildVenueQuery();
    data = result.data;
    error = result.error;

    if (!error) break;

    if (includeUpdatedAt && isMissingColumnError(error, 'updated_at')) {
      includeUpdatedAt = false;
      continue;
    }
    if (includeWebsite && isMissingColumnError(error, 'website')) {
      includeWebsite = false;
      continue;
    }
    if (includeTags && isMissingColumnError(error, 'ai_activity_tags')) {
      includeTags = false;
      continue;
    }
    if (includeVerified && isMissingColumnError(error, 'verified_activities')) {
      includeVerified = false;
      continue;
    }
    break;
  }

  if (error) {
    throw error;
  }

  const items = (data ?? [])
    .map((row) => toMapActivityFromVenue(row, query.center))
    .filter((activity): activity is DiscoveryItem => Boolean(activity))
    .sort((a, b) => (a.distance_m ?? Number.POSITIVE_INFINITY) - (b.distance_m ?? Number.POSITIVE_INFINITY));

  const taxonomySupported = items.some((item) => (item.taxonomy_categories?.length ?? 0) > 0);

  const support: DiscoveryFilterSupport = {
    activityTypes: includeVerified,
    tags: includeTags,
    traits: false,
    taxonomyCategories: taxonomySupported,
    priceLevels: false,
    capacityKey: false,
    timeWindow: false,
  };

  return { items, support };
};

const toMapActivityFromPlace = (
  row: PlaceFallbackRow,
  origin: { lat: number; lng: number },
  inference?: PlaceActivityInference | null,
): DiscoveryItem | null => {
  if (!row?.id) return null;
  const lat = sanitizeCoordinate(row.lat);
  const lng = sanitizeCoordinate(row.lng);
  if (lat == null || lng == null) return null;
  const inferredTypes = inference?.activityTypes ?? null;
  const derivedTypes = inferredTypes ?? buildPlaceActivityTypes(row);
  const inferredTaxonomy = inference?.taxonomyCategories ?? null;
  const fallbackTaxonomy = inferTaxonomyCategoriesFromTokens([
    row.name,
    row.address,
    ...(derivedTypes ?? []),
    ...(row.categories ?? []),
    ...(row.tags ?? []),
  ]);
  const taxonomyCategories = inferredTaxonomy ?? fallbackTaxonomy;
  const eligibility = evaluateActivityFirstDiscoveryPolicy({
    name: row.name,
    description: row.address ?? null,
    categories: row.categories ?? null,
    tags: row.tags ?? null,
    activityTypes: inference?.structuredActivityTypes ?? null,
    taxonomyCategories: inference?.structuredTaxonomyCategories ?? null,
    hasVenueActivityMapping: inference?.hasVenueActivityMapping ?? false,
    hasManualOverride: inference?.hasManualOverride ?? false,
  });
  if (!eligibility.isEligible) return null;
  const resolved = resolveDiscoveryDisplay({
    name: row.name,
    venue: row.address,
    placeLabel: normalizePlaceLabel(row.name, row.address),
    activityTypes: derivedTypes,
    tags: displayStringList(row.tags ?? null),
  });
  return {
    id: `place:${row.id}`,
    name: resolved.name,
    venue: row.address ?? null,
    place_id: row.id,
    place_label: resolved.placeLabel,
    website: row.website ?? null,
    lat,
    lng,
    distance_m: haversineMeters(origin.lat, origin.lng, lat, lng),
    activity_types: derivedTypes,
    tags: displayStringList(row.tags ?? null),
    traits: null,
    taxonomy_categories: taxonomyCategories,
    place_match_confidence: inference?.maxConfidence ?? row.source_confidence ?? null,
    verification_state: inference?.verificationState ?? 'suggested',
    rating: row.rating ?? null,
    rating_count: row.rating_count ?? null,
    popularity_score: row.popularity_score ?? null,
    source_confidence: row.source_confidence ?? null,
    refreshed_at: row.cached_at ?? row.updated_at ?? null,
    source: 'supabase-places',
  };
};

function normalizeActivityToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const buildPlaceActivityTypes = (row: PlaceFallbackRow): string[] | null => {
  const categories = displayStringList(row.categories ?? null) ?? [];
  const derived = new Set<string>(categories);

  const textParts = [
    row.name,
    row.address,
    ...(row.tags ?? []),
    ...(row.categories ?? []),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => normalizeActivityToken(value))
    .filter((value) => value.length > 0);

  const haystack = ` ${textParts.join(' ')} `;
  const haystackTokens = haystack.trim().split(/\s+/g).filter(Boolean);

  const stemHintsBySlug: Record<string, string[]> = {
    climbing: ['climb', 'boulder', 'escalad', 'leo nui', 'ปีนผา', 'โบลเดอร์'],
    bouldering: ['boulder', 'climb', 'โบลเดอร์'],
    padel: ['padel', 'pádel', 'พาเดล'],
    running: ['run', 'jog', 'chạy', 'วิ่ง'],
    yoga: ['yoga', 'โยคะ', 'thiền'],
    chess: ['chess', 'cờ vua', 'หมากรุก'],
  };
  const hasStemMatch = (candidate: string): boolean => {
    const normalized = normalizeActivityToken(candidate);
    if (!normalized || normalized.length < 3) return false;
    if (normalized.includes(' ')) {
      return haystack.includes(` ${normalized} `);
    }
    if (haystack.includes(` ${normalized} `)) return true;
    if (normalized.length < 4) return false;
    return haystackTokens.some((token) => token.includes(normalized));
  };

  ACTIVITY_CATALOG_PRESETS.forEach((entry) => {
    const keywordMatch = (entry.keywords ?? []).some((keyword) => {
      const token = normalizeActivityToken(keyword);
      return token.length > 0 && haystack.includes(` ${token} `);
    });
    const slugMatch = hasStemMatch(entry.slug);
    const stemMatch = (stemHintsBySlug[entry.slug] ?? []).some((stem) => hasStemMatch(stem));

    if (keywordMatch || slugMatch || stemMatch) {
      derived.add(entry.slug);
    }
  });

  return derived.size ? Array.from(derived) : null;
};

const fetchPlacesFallbackActivities = async (
  client: SupabaseClient,
  query: DiscoveryQuery,
  limit: number,
) => {
  const selectedActivityTypes = normalizeList(query.filters?.activityTypes);
  const activityFilterActive = selectedActivityTypes.length > 0;
  const hasNarrowFilters =
    activityFilterActive
    || normalizeList(query.filters?.tags).length > 0
    || normalizeList(query.filters?.peopleTraits).length > 0
    || normalizeList(query.filters?.taxonomyCategories).length > 0;
  const bounds = resolveDiscoveryBounds(query);
  const swLat = bounds.sw.lat;
  const neLat = bounds.ne.lat;
  const swLng = bounds.sw.lng;
  const neLng = bounds.ne.lng;
  const baseColumns = ['id', 'name', 'address', 'lat', 'lng'];
  let includeTags = true;
  let includeCategories = true;
  let includeUpdatedAt = true;
  let includeRating = true;
  let includeRatingCount = true;
  let includePopularity = true;
  let includeSourceConfidence = true;
  let includeCachedAt = true;
  let includeWebsite = true;

  const buildColumnList = () => {
    const columns = [...baseColumns];
    if (includeWebsite) columns.push('website');
    if (includeTags) columns.push('tags');
    if (includeCategories) columns.push('categories');
    if (includeUpdatedAt) columns.push('updated_at');
    if (includeRating) columns.push('rating');
    if (includeRatingCount) columns.push('rating_count');
    if (includePopularity) columns.push('popularity_score');
    if (includeSourceConfidence) columns.push('source_confidence');
    if (includeCachedAt) columns.push('cached_at');
    return columns;
  };

  const runLimitedQuery = async (): Promise<PlaceFallbackRow[]> => {
    const columns = buildColumnList();
    let queryBuilder = client
      .from('places')
      .select(columns.join(','))
      .gte('lat', swLat)
      .lte('lat', neLat)
      .gte('lng', swLng)
      .lte('lng', neLng)
      .limit(hasNarrowFilters ? Math.max(limit * 12, 1200) : Math.max(limit * 3, 120))
      .returns<PlaceFallbackRow[]>();
    if (includeUpdatedAt && !hasNarrowFilters) {
      queryBuilder = queryBuilder.order('updated_at', { ascending: false });
    }
    const { data, error } = await queryBuilder;
    if (error) throw error;
    return data ?? [];
  };

  const runPagedActivityQuery = async (): Promise<PlaceFallbackRow[]> => {
    const columns = buildColumnList();
    const pageSize = 850;
    const pageMax = 80;
    const rows: PlaceFallbackRow[] = [];

    for (let page = 0; page < pageMax; page += 1) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await client
        .from('places')
        .select(columns.join(','))
        .gte('lat', swLat)
        .lte('lat', neLat)
        .gte('lng', swLng)
        .lte('lng', neLng)
        .order('id', { ascending: true })
        .range(from, to)
        .returns<PlaceFallbackRow[]>();
      if (error) throw error;
      const pageRows = data ?? [];
      if (!pageRows.length) break;
      rows.push(...pageRows);
      if (pageRows.length < pageSize) break;
    }

    return rows;
  };

  let data: PlaceFallbackRow[] = [];
  let error: { code?: string | null; message?: string | null; hint?: string | null } | null = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      data = activityFilterActive ? await runPagedActivityQuery() : await runLimitedQuery();
      error = null;
      break;
    } catch (caught) {
      error = caught as { code?: string | null; message?: string | null; hint?: string | null };
    }

    if (!error) break;

      if (includeUpdatedAt && isMissingColumnError(error, 'updated_at')) {
        includeUpdatedAt = false;
        continue;
      }
      if (includeWebsite && isMissingColumnError(error, 'website')) {
        includeWebsite = false;
        continue;
      }
      if (includeTags && isMissingColumnError(error, 'tags')) {
        includeTags = false;
        continue;
    }
    if (includeCategories && isMissingColumnError(error, 'categories')) {
      includeCategories = false;
      continue;
    }
    if (includeRatingCount && isMissingColumnError(error, 'rating_count')) {
      includeRatingCount = false;
      continue;
    }
    if (includeRating && isMissingColumnError(error, 'rating')) {
      includeRating = false;
      continue;
    }
    if (includePopularity && isMissingColumnError(error, 'popularity_score')) {
      includePopularity = false;
      continue;
    }
    if (includeSourceConfidence && isMissingColumnError(error, 'source_confidence')) {
      includeSourceConfidence = false;
      continue;
    }
    if (includeCachedAt && isMissingColumnError(error, 'cached_at')) {
      includeCachedAt = false;
      continue;
    }
    break;
  }

  if (error) {
    throw error;
  }

  const placeIds = data
    .map((row) => row.id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  const inferenceByPlaceId = await loadPlaceActivityInferences(client, placeIds);
  const fallbackActivityTypesByPlaceId = new Map<string, readonly string[]>();
  data.forEach((row) => {
    if (!row.id) return;
    const inferredFallback = buildPlaceActivityTypes(row);
    if (inferredFallback?.length) {
      fallbackActivityTypesByPlaceId.set(row.id, inferredFallback);
    }
  });
  const contractFilteredRows = filterPlacesByActivityContract(data, {
    selectedActivityTypes,
    inferenceByPlaceId,
    fallbackActivityTypesByPlaceId,
    bounds,
  });

  const items = contractFilteredRows
    .map((row) => toMapActivityFromPlace(row, query.center, row.id ? inferenceByPlaceId.get(row.id) ?? null : null))
    .filter((activity): activity is DiscoveryItem => Boolean(activity))
    .sort((a, b) => (a.distance_m ?? Number.POSITIVE_INFINITY) - (b.distance_m ?? Number.POSITIVE_INFINITY));

  const activityTypesSupported = items.some((item) => (item.activity_types?.length ?? 0) > 0);
  const taxonomySupported = items.some((item) => (item.taxonomy_categories?.length ?? 0) > 0);

  const support: DiscoveryFilterSupport = {
    activityTypes: includeCategories || activityTypesSupported || activityFilterActive,
    tags: includeTags,
    traits: false,
    taxonomyCategories: taxonomySupported,
    priceLevels: false,
    capacityKey: false,
    timeWindow: false,
  };

  return { items, support };
};


const fetchActivitiesFromRpc = async (
  client: SupabaseClient,
  query: DiscoveryQuery,
): Promise<{ items: DiscoveryItem[]; support: DiscoveryFilterSupport; source: string | null }> => {
  try {
    const payload: Record<string, unknown> = {
      lat: query.center.lat,
      lng: query.center.lng,
      radius_m: query.radiusMeters,
      limit_rows: query.limit,
    };
    if (query.filters?.activityTypes?.length) payload.types = query.filters.activityTypes;
    if (query.filters?.tags?.length) payload.tags = query.filters.tags;

    const { data, error } = await client.rpc('activities_nearby', payload);
    if (error) {
      console.warn('activities_nearby RPC failed, falling back:', error.message ?? error);
      return {
        items: [],
        support: EMPTY_DISCOVERY_FILTER_SUPPORT,
        source: null,
      };
    }

    const cleaned = (data as RpcNearbyRow[] | null) ?? [];
    const items = cleaned
      .filter((row) => !hasSeedMarker(row))
      .map((row): DiscoveryItem | null => {
        const lat = row.lat_out ?? row.lat;
        const lng = row.lng_out ?? row.lng;
        if (typeof lat !== 'number' || typeof lng !== 'number') return null;
        const distance = haversineMeters(query.center.lat, query.center.lng, lat, lng);
        const resolved = resolveDiscoveryDisplay({
          name: row.name,
          venue: row.venue,
          placeLabel: normalizePlaceLabel(row.place_label ?? null, row.venue ?? null, row.name ?? null),
          activityTypes: row.activity_types ?? null,
          tags: row.tags ?? null,
        });
        return {
          id: row.id,
          name: resolved.name,
          venue: row.venue,
          place_id: row.place_id ?? null,
          place_label: resolved.placeLabel,
          lat,
          lng,
          distance_m: distance,
          activity_types: row.activity_types ?? null,
          tags: row.tags ?? null,
          traits: row.traits ?? null,
          source: 'postgis',
        };
      })
      .filter((row): row is DiscoveryItem => Boolean(row));

    const withinRadius = enforceDistanceWindow(items, query);

    return {
      items: withinRadius,
      support: FULL_DISCOVERY_FILTER_SUPPORT,
      source: withinRadius.length ? 'postgis' : null,
    };
  } catch (error) {
    console.warn('activities_nearby RPC exception, falling back:', error);
    return {
      items: [],
      support: EMPTY_DISCOVERY_FILTER_SUPPORT,
      source: null,
    };
  }
};

const isMissingParticipantPreferenceRelationship = (error: {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}): boolean => {
  const haystack = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase();
  return haystack.includes('activity_participant_preferences') && haystack.includes('relationship');
};

const fetchActivitiesFallback = async (
  client: SupabaseClient,
  query: DiscoveryQuery,
) => {
  const limit = Math.max(200, query.limit * 4);
  const baseSelectCore = ['id', 'name', 'venue', 'lat', 'lng'];
  const bounds = resolveDiscoveryBounds(query);
  const swLat = bounds.sw.lat;
  const neLat = bounds.ne.lat;
  const swLng = bounds.sw.lng;
  const neLng = bounds.ne.lng;
  let restrictByBounds = true;

  const buildSelect = (options: {
    includePreferences: boolean;
    includeTraits: boolean;
    includePlaceMetadata: boolean;
    includePlaceLabel: boolean;
    includeActivityTypes: boolean;
    includeTags: boolean;
  }) => {
    const fields = [...baseSelectCore];
    if (options.includeActivityTypes) fields.push('activity_types');
    if (options.includeTags) fields.push('tags');
    if (options.includeTraits) fields.push('traits');
    if (options.includePlaceMetadata) fields.push('place_id');
    if (options.includePlaceLabel) fields.push('place_label');
    if (options.includePreferences) {
      fields.push('participant_preferences:activity_participant_preferences(preferred_traits)');
    }
    return fields.join(',');
  };

  const execute = async (options: {
    includePreferences: boolean;
    includeTraits: boolean;
    includePlaceMetadata: boolean;
    includePlaceLabel: boolean;
    includeActivityTypes: boolean;
    includeTags: boolean;
  }) =>
    {
      let queryBuilder = client.from('activities').select(buildSelect(options)).limit(limit);
      if (restrictByBounds) {
        queryBuilder = queryBuilder
          .gte('lat', swLat)
          .lte('lat', neLat)
          .gte('lng', swLng)
          .lte('lng', neLng);
      }
      return queryBuilder.returns<NearbyActivityRow[]>();
    };

  let includePreferences = Boolean(query.filters?.peopleTraits?.length);
  let includeTraits = true;
  let includeActivityTypes = true;
  let includeTags = true;
  let includePlaceMetadata = true;
  let includePlaceLabel = true;

  let result = await execute({
    includePreferences,
    includeTraits,
    includePlaceMetadata,
    includePlaceLabel,
    includeActivityTypes,
    includeTags,
  });

  for (let attempt = 0; result.error && attempt < 5; attempt += 1) {
    if (includePreferences && isMissingParticipantPreferenceRelationship(result.error)) {
      includePreferences = false;
    } else if (includeTraits && isMissingColumnError(result.error, 'traits')) {
      includeTraits = false;
    } else if (includeActivityTypes && isMissingColumnError(result.error, 'activity_types')) {
      includeActivityTypes = false;
    } else if (includeTags && isMissingColumnError(result.error, 'tags')) {
      includeTags = false;
    } else if (includePlaceLabel && isMissingColumnError(result.error, 'place_label')) {
      includePlaceLabel = false;
    } else if (includePlaceMetadata && isMissingColumnError(result.error, 'place_id')) {
      includePlaceMetadata = false;
    } else if (
      restrictByBounds &&
      (isMissingColumnError(result.error, 'lat') || isMissingColumnError(result.error, 'lng'))
    ) {
      restrictByBounds = false;
    } else {
      break;
    }

    result = await execute({
      includePreferences,
      includeTraits,
      includePlaceMetadata,
      includePlaceLabel,
      includeActivityTypes,
      includeTags,
    });
  }

  if (result.error) {
    const message = result.error.message?.toLowerCase?.() ?? '';
    if (message.includes('ambiguous') || message.includes('column reference')) {
      throw new Error('Nearby locations are temporarily unavailable. Please try again soon.');
    }
    throw result.error;
  }

  let rows = result.data ?? [];
  rows = filterOutSeedActivities(rows);

  if (!includePreferences) {
    rows = rows.map((row) => ({ ...row, participant_preferences: null }));
  }
  if (!includeTraits) {
    rows = rows.map((row) => ({ ...row, traits: null }));
  }
  if (!includeActivityTypes) {
    rows = rows.map((row) => ({ ...row, activity_types: null }));
  }
  if (!includeTags) {
    rows = rows.map((row) => ({ ...row, tags: null }));
  }
  if (!includePlaceMetadata) {
    rows = rows.map((row) => ({ ...row, place_id: null }));
  }
  if (!includePlaceLabel) {
    rows = rows.map((row) => ({ ...row, place_label: null }));
  }

  const withDistance = rows
    .map((row) => {
      if (typeof row.lat !== 'number' || typeof row.lng !== 'number') return null;
      const distance = haversineMeters(query.center.lat, query.center.lng, row.lat, row.lng);
      return { ...row, distance };
    })
    .filter((row): row is NearbyActivityRow & { distance: number } => Boolean(row));

  withDistance.sort((a, b) => a.distance - b.distance);

  const withinRadius = withDistance.filter((row) => row.distance <= query.radiusMeters);

  const scanLimit = Math.max(query.limit * 4, 400);
  const chosen = withinRadius.slice(0, scanLimit);
  const activityIds = chosen.map((row) => row.id);
  const upcomingCounts: Record<string, number> = {};

  if (activityIds.length) {
    const nowIso = new Date().toISOString();
    const { data: upcomingRows, error: upcomingError } = await client
      .from('sessions')
      .select('activity_id')
      .in('activity_id', activityIds)
      .gte('starts_at', nowIso)
      .limit(5000)
      .returns<UpcomingSessionRow[]>();

    if (upcomingError) {
      console.warn('[nearby] failed to load upcoming session counts', upcomingError);
    } else if (upcomingRows) {
      for (const row of upcomingRows) {
        if (!row.activity_id) continue;
        upcomingCounts[row.activity_id] = (upcomingCounts[row.activity_id] ?? 0) + 1;
      }
    }
  }

  const items = prioritizeMeaningfulActivities(chosen.map((row) => {
    const prefTraits = (row.participant_preferences ?? []).flatMap((pref) =>
      (pref?.preferred_traits ?? []).filter((trait): trait is string => typeof trait === 'string'),
    );
    const uniqueTraits = Array.from(
      new Set<string>([
        ...((row.traits ?? []).filter((trait): trait is string => typeof trait === 'string')),
        ...prefTraits,
      ]),
    );

    const resolved = resolveDiscoveryDisplay({
      name: row.name,
      venue: row.venue,
      placeLabel: normalizePlaceLabel(row.place_label ?? null, row.venue ?? null, row.name ?? null),
      activityTypes: row.activity_types ?? null,
      tags: row.tags ?? null,
    });

    return {
      id: row.id,
      name: resolved.name,
      venue: row.venue,
      place_id: row.place_id ?? null,
      place_label: resolved.placeLabel,
      lat: row.lat as number,
      lng: row.lng as number,
      distance_m: row.distance,
      activity_types: row.activity_types ?? null,
      tags: row.tags ?? null,
      traits: uniqueTraits.length ? uniqueTraits : null,
      upcoming_session_count: upcomingCounts[row.id] ?? 0,
      source: 'activities',
    } satisfies DiscoveryItem;
  }));

  return {
    items,
    support: {
      activityTypes: includeActivityTypes,
      tags: includeTags,
      traits: includeTraits || includePreferences,
      taxonomyCategories: includeActivityTypes,
      priceLevels: true,
      capacityKey: true,
      timeWindow: true,
    } satisfies DiscoveryFilterSupport,
  };
};

const hydrateActivitiesWithPlaces = async (
  client: SupabaseClient,
  activities: DiscoveryItem[],
) => {
  const placeIds = Array.from(
    new Set(
      activities
        .map((activity) => activity.place_id)
        .filter((placeId): placeId is string => typeof placeId === 'string' && placeId.trim().length > 0),
    ),
  );
  if (!placeIds.length) {
    return activities.map((activity) => ({
      ...activity,
      place_label: hydratePlaceLabel({
        venue: activity.venue,
        fallbackLabel: activity.place_label,
      }),
    }));
  }

  let includeWebsite = true;
  let data:
    | Array<{ id: string; name: string | null; website?: string | null }>
    | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await client
      .from('places')
      .select(includeWebsite ? 'id,name,website' : 'id,name')
      .in('id', placeIds);

    if (!result.error) {
      data = (result.data as unknown as Array<{ id: string; name: string | null; website?: string | null }>) ?? null;
      break;
    }

    if (includeWebsite && isMissingColumnError(result.error, 'website')) {
      includeWebsite = false;
      continue;
    }

    console.warn('[nearby] failed to hydrate place labels', result.error.message ?? result.error);
    return activities;
  }

  const placeMap = new Map<string, { id: string; name: string | null; website: string | null }>();
  (data ?? []).forEach((row) => {
    if (row?.id) {
      placeMap.set(row.id, { id: row.id, name: row.name ?? null, website: row.website ?? null });
    }
  });
  return activities.map((activity) => {
    const place = activity.place_id ? placeMap.get(activity.place_id) ?? null : null;
    return {
      ...activity,
      place_label: hydratePlaceLabel({
        place,
        venue: activity.venue ?? null,
        fallbackLabel: activity.place_label,
      }),
      website: activity.website ?? place?.website ?? null,
    };
  });
};

type DiscoverNearbyOptions = {
  bypassCache?: boolean;
  includeDebug?: boolean;
  debugMetrics?: boolean;
};

export async function discoverNearbyActivities(
  query: DiscoveryQuery,
  options?: DiscoverNearbyOptions,
): Promise<DiscoveryResult> {
  const normalizedQuery: DiscoveryQuery = {
    ...query,
    radiusMeters: normalizeRadius(query.radiusMeters),
    bounds: query.bounds ? resolveDiscoveryBounds(query) : undefined,
    limit: Math.max(1, Math.min(query.limit, MAX_CACHE_ITEMS)),
  };
  const normalizedFilters = normalizeFilters(normalizedQuery.filters);

  const cacheKey = buildDiscoveryCacheKey('activities', normalizedQuery);
  const tileKey = computeTileKey(normalizedQuery.center);
  const cacheClient = getOptionalServiceClient() ?? db();
  const { entry, record } = await readDiscoveryCache(cacheClient, tileKey, cacheKey);
  const bypassCache = Boolean(options?.bypassCache);
  const includeDebug = Boolean(options?.includeDebug);
  const debugMetrics = Boolean(options?.debugMetrics);

  if (!bypassCache && entry) {
    const cached = buildCacheResult(entry, normalizedQuery, cacheKey);
    const cachedDedupeDropped = Math.max(0, entry.items.length - cached.items.length);
    logDiscoveryDebugMetrics({
      enabled: debugMetrics,
      cacheHit: true,
      dedupeInput: entry.items.length,
      dedupeDropped: cachedDedupeDropped,
      providerCounts: entry.providerCounts ?? null,
      source: cached.source ?? null,
      reason: 'cache-hit',
    });
    if (includeDebug) {
      const explain = entry.explain ?? emptyExplainSnapshot(cacheKey, tileKey);
      cached.debug = {
        cacheHit: true,
        cacheKey,
        tilesTouched: explain.tilesTouched.length ? explain.tilesTouched : [tileKey],
        providerCounts: entry.providerCounts ?? createEmptyProviderCounts(),
        pagesFetched: explain.pagesFetched,
        nextPageTokensUsed: explain.nextPageTokensUsed,
        itemsBeforeDedupe: explain.itemsBeforeDedupe || entry.items.length,
        itemsAfterDedupe: explain.itemsAfterDedupe || cached.items.length,
        itemsAfterGates: explain.itemsAfterGates || cached.items.length,
        itemsAfterFilters: explain.itemsAfterFilters || cached.items.length,
        dropReasons: mergeNumericMap(
          {
            deduped: Math.max(0, entry.items.length - cached.items.length),
          },
          explain.dropReasons,
        ),
        candidateCounts: {
          afterRpc: entry.items.length,
          afterFallbackMerge: entry.items.length,
          afterMetadataFilter: entry.items.length,
          afterPlaceGate: entry.items.length,
          afterConfidenceGate: entry.items.length,
          afterDedupe: cached.items.length,
          final: cached.items.length,
        },
        dropped: {
          notPlaceBacked: 0,
          lowConfidence: 0,
          genericLabels: 0,
          deduped: Math.max(0, entry.items.length - cached.items.length),
        },
        ranking: {
          enabled: true,
          placeMinConfidence: ACTIVITY_PLACE_MIN_CONFIDENCE,
        },
      };
    }
    return cached;
  }

  const supabase = db();
  let filterSupport = EMPTY_DISCOVERY_FILTER_SUPPORT;

  const rpcResult = await fetchActivitiesFromRpc(supabase, normalizedQuery);
  const debug = {
    cacheHit: false,
    cacheKey,
    tilesTouched: [tileKey],
    providerCounts: createEmptyProviderCounts(),
    pagesFetched: 0,
    nextPageTokensUsed: 0,
    itemsBeforeDedupe: 0,
    itemsAfterDedupe: 0,
    itemsAfterGates: 0,
    itemsAfterFilters: 0,
    dropReasons: {},
    candidateCounts: {
      afterRpc: 0,
      afterFallbackMerge: 0,
      afterMetadataFilter: 0,
      afterPlaceGate: 0,
      afterConfidenceGate: 0,
      afterDedupe: 0,
      final: 0,
    },
    dropped: {
      notPlaceBacked: 0,
      lowConfidence: 0,
      genericLabels: 0,
      deduped: 0,
    },
    ranking: {
      enabled: true,
      placeMinConfidence: ACTIVITY_PLACE_MIN_CONFIDENCE,
    },
  } satisfies DiscoveryDebug;
  let activities = filterByQuery(rpcResult.items, normalizedFilters, rpcResult.support);
  debug.candidateCounts.afterRpc = activities.length;
  filterSupport = mergeDiscoveryFilterSupport(filterSupport, rpcResult.support);
  const source = rpcResult.source ?? undefined;

  const fallbackResult = await fetchActivitiesFallback(supabase, normalizedQuery);
  const fallbackItems = filterByQuery(fallbackResult.items, normalizedFilters, fallbackResult.support);
  filterSupport = mergeDiscoveryFilterSupport(filterSupport, fallbackResult.support);

  activities = mergeActivitiesWithFallback(activities, fallbackItems);
  debug.candidateCounts.afterFallbackMerge = activities.length;

  let fallbackMeta: { degraded?: boolean; fallbackError?: string; fallbackSource?: string } = {};
  let providerCounts: Record<string, number> | undefined;
  const touchedTiles = new Set<string>([tileKey]);
  const applySeedExplain = (meta: DiscoverySeedMeta | null) => {
    if (!meta?.explain) return;
    debug.pagesFetched += meta.explain.pagesFetched;
    debug.nextPageTokensUsed += meta.explain.nextPageTokensUsed;
    debug.itemsBeforeDedupe += meta.explain.itemsBeforeDedupe;
    debug.itemsAfterDedupe = Math.max(debug.itemsAfterDedupe, meta.explain.itemsAfterDedupe);
    debug.itemsAfterGates = Math.max(debug.itemsAfterGates, meta.explain.itemsAfterGates);
    debug.itemsAfterFilters = Math.max(debug.itemsAfterFilters, meta.explain.itemsAfterFilters);
    mergeNumericMap(debug.dropReasons, meta.explain.dropReasons);
    meta.explain.tilesTouched.forEach((tile) => touchedTiles.add(tile));
  };
  const applyProviderCounts = (counts: Record<string, number> | undefined) => {
    if (!counts) return;
    providerCounts = providerCounts ?? createEmptyProviderCounts();
    mergeNumericMap(providerCounts, counts);
  };

  const seededViewportInventory = await maybeSeedViewportInventory(
    normalizedQuery,
    normalizedFilters,
    activities.length,
  );

  if (seededViewportInventory?.seeded) {
    applyProviderCounts(seededViewportInventory.providerCounts);
    applySeedExplain(seededViewportInventory);
    const refreshedPlacesFallback = await fetchPlacesFallbackActivities(
      supabase,
      normalizedQuery,
      Math.max(normalizedQuery.limit, 320),
    );
    const filteredRefreshedPlaces = filterByQuery(
      refreshedPlacesFallback.items,
      normalizedFilters,
      refreshedPlacesFallback.support,
    );
    if (filteredRefreshedPlaces.length) {
      filterSupport = mergeDiscoveryFilterSupport(filterSupport, refreshedPlacesFallback.support);
      activities = mergeActivitiesWithFallback(activities, filteredRefreshedPlaces);
      fallbackMeta.fallbackSource = 'supabase-places';
    }
  }

  const bootstrappedSparseCity = await maybeBootstrapSparseCityPlaces(
    normalizedQuery,
    normalizedFilters,
    activities.length,
  );

  if (bootstrappedSparseCity?.seeded) {
    applyProviderCounts(bootstrappedSparseCity.providerCounts);
    applySeedExplain(bootstrappedSparseCity);
    const refreshedPlacesFallback = await fetchPlacesFallbackActivities(
      supabase,
      normalizedQuery,
      Math.max(normalizedQuery.limit, 300),
    );
    const filteredRefreshedPlaces = filterByQuery(
      refreshedPlacesFallback.items,
      normalizedFilters,
      refreshedPlacesFallback.support,
    );
    if (filteredRefreshedPlaces.length) {
      filterSupport = mergeDiscoveryFilterSupport(filterSupport, refreshedPlacesFallback.support);
      activities = mergeActivitiesWithFallback(activities, filteredRefreshedPlaces);
      fallbackMeta.fallbackSource = 'supabase-places';
    }
  }

  if (activities.length < normalizedQuery.limit) {
    try {
      const venueFallback = await fetchVenueFallbackActivities(supabase, normalizedQuery, normalizedQuery.limit);
      const filteredVenueFallback = filterByQuery(venueFallback.items, normalizedFilters, venueFallback.support);
      if (filteredVenueFallback.length) {
        filterSupport = mergeDiscoveryFilterSupport(filterSupport, venueFallback.support);
        activities = mergeActivitiesWithFallback(activities, filteredVenueFallback);
        fallbackMeta.fallbackSource = fallbackMeta.fallbackSource ?? 'supabase-venues';
      }

      if (activities.length < normalizedQuery.limit) {
        const placesFallback = await fetchPlacesFallbackActivities(supabase, normalizedQuery, normalizedQuery.limit);
        const filteredPlacesFallback = filterByQuery(placesFallback.items, normalizedFilters, placesFallback.support);
        if (filteredPlacesFallback.length) {
          filterSupport = mergeDiscoveryFilterSupport(filterSupport, placesFallback.support);
          activities = mergeActivitiesWithFallback(activities, filteredPlacesFallback);
          fallbackMeta.fallbackSource = fallbackMeta.fallbackSource ?? 'supabase-places';
        }
      }
    } catch (venueFallbackError) {
      console.warn('[nearby] venue fallback failed', venueFallbackError);
      if (!fallbackMeta.degraded) {
        fallbackMeta = {
          degraded: true,
          fallbackError: venueFallbackError instanceof Error ? venueFallbackError.message : String(venueFallbackError),
        };
      }
    }
  }

  debug.tilesTouched = Array.from(touchedTiles);

  activities = enforceDistanceWindow(activities, normalizedQuery);
  debug.candidateCounts.afterFallbackMerge = activities.length;

  const metadataResult = await hydrateActivitiesMetadata(supabase, activities);
  activities = metadataResult.items;
  filterSupport = mergeDiscoveryFilterSupport(filterSupport, {
    activityTypes: true,
    tags: true,
    traits: true,
    taxonomyCategories: metadataResult.support.taxonomyCategories,
    priceLevels: metadataResult.support.priceLevels,
    capacityKey: metadataResult.support.capacityKey,
    timeWindow: metadataResult.support.timeWindow,
  });
  activities = filterByQuery(activities, normalizedFilters, filterSupport);
  debug.candidateCounts.afterMetadataFilter = activities.length;
  debug.itemsAfterFilters = activities.length;

  const nonGenericActivities = filterGenericActivities(activities);
  const shouldPreserveGenericFallback =
    hasTypeOrTagDiscoveryFilters(normalizedFilters)
    && nonGenericActivities.length === 0
    && activities.length > 0;
  debug.dropped.genericLabels = shouldPreserveGenericFallback
    ? 0
    : Math.max(0, activities.length - nonGenericActivities.length);
  activities = shouldPreserveGenericFallback ? activities : nonGenericActivities;

  const hasTypeIntentFilters = hasTypeOrTagDiscoveryFilters(normalizedFilters);
  const minResultsAfterGates = Math.min(
    normalizedQuery.limit,
    hasTypeIntentFilters ? MIN_RESULTS_AFTER_GATES_FILTERED : MIN_RESULTS_AFTER_GATES_INVENTORY,
  );
  const placeBacked = activities.filter(isPlaceBackedActivity);
  const nonPlaceBacked = activities.filter((item) => !isPlaceBackedActivity(item));

  const rankedPlaceBacked = rankDiscoveryItems(placeBacked, {
    center: normalizedQuery.center,
    filters: normalizedFilters,
  });

  let minConfidence = hasTypeIntentFilters
    ? ACTIVITY_PLACE_MIN_CONFIDENCE_FILTERED
    : ACTIVITY_PLACE_MIN_CONFIDENCE;

  let confidencePassed = rankedPlaceBacked.filter((item) => {
    const confidence = item.place_match_confidence ?? item.quality_confidence ?? 0;
    return confidence >= minConfidence;
  });

  if (!hasTypeIntentFilters && confidencePassed.length < minResultsAfterGates) {
    minConfidence = ACTIVITY_PLACE_MIN_CONFIDENCE_RELAXED_INVENTORY;
    const relaxed = rankedPlaceBacked.filter((item) => {
      const confidence = item.place_match_confidence ?? item.quality_confidence ?? 0;
      return confidence >= minConfidence;
    });
    if (relaxed.length > confidencePassed.length) {
      confidencePassed = relaxed;
    }
  }

  if (confidencePassed.length < minResultsAfterGates && minConfidence > ACTIVITY_PLACE_MIN_CONFIDENCE_FLOOR) {
    const floorMatched = rankedPlaceBacked.filter((item) => {
      const confidence = item.place_match_confidence ?? item.quality_confidence ?? 0;
      return confidence >= ACTIVITY_PLACE_MIN_CONFIDENCE_FLOOR;
    });
    if (floorMatched.length > confidencePassed.length) {
      minConfidence = ACTIVITY_PLACE_MIN_CONFIDENCE_FLOOR;
      confidencePassed = floorMatched;
    }
  }

  let spilloverNonPlaceBacked: DiscoveryItem[] = [];
  if (confidencePassed.length < minResultsAfterGates && nonPlaceBacked.length > 0) {
    const rankedNonPlaceBacked = rankDiscoveryItems(nonPlaceBacked, {
      center: normalizedQuery.center,
      filters: normalizedFilters,
    });
    spilloverNonPlaceBacked = rankedNonPlaceBacked.slice(
      0,
      Math.max(0, minResultsAfterGates - confidencePassed.length),
    );
  }

  activities = [...confidencePassed, ...spilloverNonPlaceBacked];
  debug.dropped.notPlaceBacked = Math.max(0, nonPlaceBacked.length - spilloverNonPlaceBacked.length);
  debug.candidateCounts.afterPlaceGate = placeBacked.length + spilloverNonPlaceBacked.length;
  debug.dropped.lowConfidence = Math.max(0, placeBacked.length - confidencePassed.length);
  debug.candidateCounts.afterConfidenceGate = activities.length;
  debug.itemsAfterGates = activities.length;
  debug.ranking.placeMinConfidence = minConfidence;

  const ordered = prioritizeMeaningfulActivities(
    orderDiscoveryItems(activities, normalizedFilters.sortMode),
  ).slice(0, normalizedQuery.limit);
  const hydrated = await hydrateActivitiesWithPlaces(supabase, ordered);
  debug.itemsBeforeDedupe = hydrated.length;
  const deduped = mergeActivitiesWithFallback(hydrated, []);
  debug.dropped.deduped = Math.max(0, hydrated.length - deduped.length);
  debug.candidateCounts.afterDedupe = deduped.length;
  debug.itemsAfterDedupe = deduped.length;
  const limited = deduped.slice(0, normalizedQuery.limit);
  debug.candidateCounts.final = limited.length;
  const resolvedProviderCounts = providerCounts ?? createEmptyProviderCounts();
  debug.providerCounts = resolvedProviderCounts;
  mergeNumericMap(debug.dropReasons, {
    notPlaceBacked: debug.dropped.notPlaceBacked,
    lowConfidence: debug.dropped.lowConfidence,
    genericLabels: debug.dropped.genericLabels,
    deduped: debug.dropped.deduped,
  });

  const result: DiscoveryResult = {
    center: normalizedQuery.center,
    radiusMeters: normalizedQuery.radiusMeters,
    count: limited.length,
    items: limited,
    filterSupport,
    facets: buildFacets(limited),
    sourceBreakdown: buildSourceBreakdown(limited),
    cache: { key: cacheKey, hit: false },
    source: source ?? fallbackMeta.fallbackSource ?? 'client-filter',
    providerCounts: resolvedProviderCounts,
    debug: includeDebug ? debug : undefined,
    ...fallbackMeta,
  };

  logDiscoveryDebugMetrics({
    enabled: debugMetrics,
    cacheHit: false,
    dedupeInput: debug.candidateCounts.afterConfidenceGate,
    dedupeDropped: debug.dropped.deduped,
    providerCounts: resolvedProviderCounts,
    source: result.source ?? null,
    reason: 'fresh-fetch',
    filterDrops: debug.dropped,
  });

  const cacheEntry = ensureCacheEntry({ ...result, debug });
  void writeDiscoveryCache(cacheClient, tileKey, cacheKey, cacheEntry, record);

  return result;
}

export async function discoverNearbyVenues(
  query: DiscoveryQuery,
  activity: ActivityName,
  options?: { includeUnverified?: boolean },
): Promise<{
  result: DiscoveryResult;
  venues: RankedVenueActivity[];
  debug?: { limitApplied: number; venueCount: number; voteCount: number };
}> {
  const includeUnverified = options?.includeUnverified ?? true;

  const normalizedQuery: DiscoveryQuery = {
    ...query,
    radiusMeters: normalizeRadius(query.radiusMeters),
    bounds: query.bounds ? resolveDiscoveryBounds(query) : undefined,
    limit: Math.max(1, Math.min(query.limit, MAX_CACHE_ITEMS)),
  };
  const normalizedFilters = normalizeFilters(normalizedQuery.filters);

  const baseCacheKey = buildDiscoveryCacheKey('venues', {
    ...normalizedQuery,
    filters: { activityTypes: [activity] },
  });
  const cacheKey = includeUnverified ? baseCacheKey : `${baseCacheKey}|verified`;
  const tileKey = computeTileKey(normalizedQuery.center);
  const cacheClient = getOptionalServiceClient() ?? db();
  const { entry, record } = await readDiscoveryCache(cacheClient, tileKey, cacheKey);

  if (entry && Array.isArray(entry.venues)) {
    const cacheResult = buildCacheResult(entry, normalizedQuery, cacheKey);
    return { result: cacheResult, venues: entry.venues, debug: undefined };
  }

  const supabase = getOptionalServiceClient() ?? db();
  const { results, debug } = await searchVenueActivities({
    supabase,
    activity: activity,
    limit: normalizedQuery.limit,
    bounds: normalizedQuery.bounds ?? undefined,
    radius: normalizedQuery.bounds
      ? undefined
      : { center: normalizedQuery.center, radiusMeters: normalizedQuery.radiusMeters },
    includeUnverified,
  });

  const items: DiscoveryItem[] = results
    .filter((row) => typeof row.lat === 'number' && typeof row.lng === 'number')
    .map((row) => ({
      id: row.venueId,
      name: row.venueName,
      venue: row.displayAddress ?? null,
      place_id: null,
      place_label: normalizePlaceLabel(row.venueName, row.displayAddress ?? null),
      lat: row.lat as number,
      lng: row.lng as number,
      distance_m: haversineMeters(normalizedQuery.center.lat, normalizedQuery.center.lng, row.lat as number, row.lng as number),
      activity_types: [activity],
      tags: row.primaryCategories?.length ? row.primaryCategories : null,
      traits: null,
      trust_score: row.trustScore,
      verification_state: row.verificationState,
      rank_score: row.trustScore,
      source: 'venues',
    }));

  const deduped = dedupeByPlaceKey(items);
  const ordered = orderDiscoveryItems(deduped, normalizedFilters.sortMode).slice(0, normalizedQuery.limit);

  const result: DiscoveryResult = {
    center: normalizedQuery.center,
    radiusMeters: normalizedQuery.radiusMeters,
    count: ordered.length,
    items: ordered,
    filterSupport: {
      activityTypes: true,
      tags: true,
      traits: false,
      taxonomyCategories: false,
      priceLevels: false,
      capacityKey: false,
      timeWindow: false,
    },
    facets: buildFacets(ordered),
    sourceBreakdown: buildSourceBreakdown(ordered),
    cache: { key: cacheKey, hit: false },
    source: 'venues',
  };

  const cacheEntry = ensureCacheEntry(result, results);
  void writeDiscoveryCache(cacheClient, tileKey, cacheKey, cacheEntry, record);

  return { result, venues: results, debug };
}

const normalizeNumberValues = (values?: readonly (number | null | undefined)[]) =>
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null))
        .filter((value): value is number => value != null),
    ),
  ).sort((a, b) => a - b);

const SESSION_METADATA_LOOKAHEAD_MS = 45 * 24 * 60 * 60 * 1000;
const TAXONOMY_ID_PATTERN = /^tier[0-9]+-/i;
const CAPACITY_RANK: Record<CapacityFilterKey, number> = {
  any: 0,
  couple: 1,
  small: 2,
  medium: 3,
  large: 4,
};

type SessionMetadataRow = {
  activity_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  price_cents: number | null;
  max_attendees: number | null;
};

type ActivityMetadataEntry = {
  priceLevels: Set<number>;
  capacityKey: CapacityFilterKey | null;
  nextSessionAt: number | null;
  timeWindow: TimeWindowKey | null;
  openNow: boolean;
};

type MetadataSupport = {
  taxonomyCategories: boolean;
  priceLevels: boolean;
  capacityKey: boolean;
  timeWindow: boolean;
};

async function hydrateActivitiesMetadata(client: SupabaseClient, activities: DiscoveryItem[]) {
  const support: MetadataSupport = {
    taxonomyCategories: true,
    priceLevels: false,
    capacityKey: false,
    timeWindow: false,
  };

  const uuidIds = Array.from(
    new Set(
      activities
        .map((item) => (isUuid(item.id) ? item.id : null))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const sessionMetadata = new Map<string, ActivityMetadataEntry>();
  const nowMs = Date.now();
  let sessionQueryFailed = false;

  if (uuidIds.length) {
    const windowStart = new Date(nowMs).toISOString();
    const windowEnd = new Date(nowMs + SESSION_METADATA_LOOKAHEAD_MS).toISOString();
    try {
      const { data, error } = await client
        .from('sessions')
        .select('activity_id, starts_at, ends_at, price_cents, max_attendees')
        .in('activity_id', uuidIds)
        .gte('starts_at', windowStart)
        .lte('starts_at', windowEnd)
        .limit(5000)
        .returns<SessionMetadataRow[]>();

      if (error) {
        sessionQueryFailed = true;
        console.warn('[discovery] failed to load session metadata', error.message ?? error);
      } else if (data) {
        data.forEach((row) => {
          if (!row.activity_id) return;
          const entry = ensureMetadataEntry(sessionMetadata, row.activity_id);
          const priceLevel = derivePriceLevel(row.price_cents);
          if (priceLevel != null) {
            entry.priceLevels.add(priceLevel);
          }
          const capacityKey = deriveCapacityKey(row.max_attendees);
          entry.capacityKey = pickCapacityKey(entry.capacityKey, capacityKey);
          const timeWindow = deriveTimeWindow(row.starts_at, row.ends_at, nowMs);
          if (timeWindow.openNow) {
            entry.timeWindow = 'open_now';
            entry.openNow = true;
            entry.nextSessionAt = timeWindow.startMs ?? entry.nextSessionAt;
          } else if (!entry.openNow && timeWindow.window) {
            if (
              entry.nextSessionAt == null ||
              (timeWindow.startMs != null && timeWindow.startMs < entry.nextSessionAt)
            ) {
              entry.nextSessionAt = timeWindow.startMs;
              entry.timeWindow = timeWindow.window;
            }
          }
        });
      }
    } catch (error) {
      sessionQueryFailed = true;
      console.warn('[discovery] session metadata exception', error);
    }
  }

  if (uuidIds.length && !sessionQueryFailed) {
    support.priceLevels = true;
    support.capacityKey = true;
    support.timeWindow = true;
  }

  const enriched = activities.map((item) => {
    const taxonomy = deriveTaxonomyCategories(item);
    const metadata = sessionMetadata.get(item.id) ?? null;
    const metadataPriceLevels = metadata ? normalizeNumberValues(Array.from(metadata.priceLevels)) : [];
    const existingPriceLevels = normalizeNumberValues(item.price_levels ?? undefined);
    const priceLevels = metadataPriceLevels.length ? metadataPriceLevels : existingPriceLevels;
    const capacityKey = metadata?.capacityKey ?? item.capacity_key ?? null;
    const timeWindow = metadata?.timeWindow ?? item.time_window ?? null;
    return {
      ...item,
      taxonomy_categories: taxonomy,
      price_levels: priceLevels.length ? priceLevels : null,
      capacity_key: capacityKey,
      time_window: timeWindow,
    } satisfies DiscoveryItem;
  });

  return { items: enriched, support };
}

function ensureMetadataEntry(map: Map<string, ActivityMetadataEntry>, activityId: string): ActivityMetadataEntry {
  let entry = map.get(activityId);
  if (!entry) {
    entry = {
      priceLevels: new Set<number>(),
      capacityKey: null,
      nextSessionAt: null,
      timeWindow: null,
      openNow: false,
    };
    map.set(activityId, entry);
  }
  return entry;
}

function deriveTaxonomyCategories(item: DiscoveryItem): string[] | null {
  const existing = normalizeTaxonomyList(item.taxonomy_categories);
  if (existing) return existing;
  const fromActivityTypes = normalizeTaxonomyList(item.activity_types);
  if (fromActivityTypes) return fromActivityTypes;
  return normalizeTaxonomyList(item.tags);
}

function normalizeTaxonomyList(values?: readonly (string | null | undefined)[] | null): string[] | null {
  if (!values?.length) return null;
  const entries = Array.from(
    new Set(
      values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => Boolean(value) && TAXONOMY_ID_PATTERN.test(value)),
    ),
  ).sort((a, b) => a.localeCompare(b));
  return entries.length ? entries : null;
}

function derivePriceLevel(priceCents: number | null | undefined): number | null {
  if (typeof priceCents !== 'number' || !Number.isFinite(priceCents)) return null;
  if (priceCents <= 0) return 1;
  if (priceCents <= 2000) return 1;
  if (priceCents <= 5000) return 2;
  if (priceCents <= 10000) return 3;
  return 4;
}

function deriveCapacityKey(value: number | null | undefined): CapacityFilterKey | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  if (value >= 10) return 'large';
  if (value >= 8) return 'medium';
  if (value >= 5) return 'small';
  if (value >= 2) return 'couple';
  return null;
}

function pickCapacityKey(
  current: CapacityFilterKey | null,
  next: CapacityFilterKey | null,
): CapacityFilterKey | null {
  if (!next) return current;
  if (!current) return next;
  return CAPACITY_RANK[next] >= CAPACITY_RANK[current] ? next : current;
}

function parseLocalHourFromIso(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const match = value.match(/([+-])(\d{2}):?(\d{2})$/);
  let hour = date.getUTCHours();
  if (match) {
    const sign = match[1] === '-' ? -1 : 1;
    const offsetHours = Number(match[2]);
    const offsetMinutes = Number(match[3]);
    hour += sign * offsetHours + sign * (offsetMinutes / 60);
  }
  hour %= 24;
  if (hour < 0) hour += 24;
  return hour;
}

function resolveTimeWindowBucket(hour: number): TimeWindowKey | null {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late';
}

function deriveTimeWindow(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  nowMs: number,
): { window: TimeWindowKey | null; startMs: number | null; openNow: boolean } {
  if (!startsAt) {
    return { window: null, startMs: null, openNow: false };
  }
  const startMs = Date.parse(startsAt);
  if (!Number.isFinite(startMs)) {
    return { window: null, startMs: null, openNow: false };
  }
  const endsMs = endsAt ? Date.parse(endsAt) : Number.NaN;
  const effectiveEnd = Number.isFinite(endsMs) ? endsMs : startMs + 90 * 60 * 1000;
  if (nowMs >= startMs && nowMs <= effectiveEnd) {
    return { window: 'open_now', startMs, openNow: true };
  }
  const hour = parseLocalHourFromIso(startsAt);
  if (hour == null) {
    return { window: null, startMs, openNow: false };
  }
  return { window: resolveTimeWindowBucket(hour), startMs, openNow: false };
}

export const __discoveryEngineTestUtils = {
  mergeActivitiesWithFallback,
  dedupeByPlaceKey,
  buildPlaceActivityTypes,
};
