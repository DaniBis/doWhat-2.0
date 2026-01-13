import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  DiscoveryFacets,
  DiscoveryFilterSupport,
  DiscoveryItem,
  NormalizedDiscoveryFilters,
  DiscoveryQuery,
  DiscoveryResult,
  DiscoverySourceBreakdown,
} from '@dowhat/discovery-engine';
import {
  CACHE_TTL_MS,
  MAX_CACHE_ENTRIES,
  MAX_CACHE_ITEMS,
  buildDiscoveryCacheKey,
  computeTileKey,
  haversineMeters,
  normalizeFilters,
  normalizeList,
  normalizeRadius,
  roundCoordinate,
  sanitizeCoordinate,
} from '@dowhat/discovery-engine';
export { buildDiscoveryCacheKey } from '@dowhat/discovery-engine';
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
  DiscoverySourceBreakdown,
} from '@dowhat/discovery-engine';
import { filterOutSeedActivities, hasSeedMarker, isUuid } from '@dowhat/shared';
import type { CapacityFilterKey, TimeWindowKey } from '@dowhat/shared';

import { db } from '@/lib/db';
import { resolveDiscoveryBounds } from '@/lib/discovery/bounds';
import { hydratePlaceLabel, normalizePlaceLabel } from '@/lib/places/labels';
import { getOptionalServiceClient } from '@/lib/supabase/service';
import { searchVenueActivities } from '@/lib/venues/search';
import type { ActivityName } from '@/lib/venues/constants';
import type { RankedVenueActivity } from '@/lib/venues/types';

const OVERPASS_ENDPOINT =
  process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter';


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
  venues?: RankedVenueActivity[];
};

type DiscoveryCacheRecord = Record<string, DiscoveryCacheEntry>;

const extractCacheRecord = (value: unknown): DiscoveryCacheRecord => {
  if (!value || typeof value !== 'object') return {};
  if (Array.isArray(value)) return {};
  return value as DiscoveryCacheRecord;
};

const readDiscoveryCache = async (
  client: SupabaseClient,
  tileKey: string,
  cacheKey: string,
): Promise<{ entry: DiscoveryCacheEntry | null; record: DiscoveryCacheRecord }> => {
  try {
    const { data, error } = await client
      .from('place_tiles')
      .select('discovery_cache')
      .eq('geohash6', tileKey)
      .maybeSingle();

    if (error) {
      if (isMissingColumnError(error, 'discovery_cache')) {
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
  const nextRecord = pruneCacheRecord({ ...record, [cacheKey]: entry });
  try {
    const { error } = await client
      .from('place_tiles')
      .upsert({ geohash6: tileKey, discovery_cache: nextRecord }, { onConflict: 'geohash6' });
    if (error) throw error;
  } catch (error) {
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
    const key = item.source;
    breakdown[key] = (breakdown[key] ?? 0) + 1;
  });
  return breakdown;
};

const orderDiscoveryItems = (items: DiscoveryItem[]) =>
  [...items].sort((a, b) => {
    const distanceA = a.distance_m ?? Number.POSITIVE_INFINITY;
    const distanceB = b.distance_m ?? Number.POSITIVE_INFINITY;
    if (distanceA !== distanceB) return distanceA - distanceB;
    const nameOrder = a.name.localeCompare(b.name);
    if (nameOrder !== 0) return nameOrder;
    return a.id.localeCompare(b.id);
  });

const placeKeyForItem = (item: DiscoveryItem): string => {
  if (item.place_id) return `place:${item.place_id}`;
  const name = item.name ? item.name.trim().toLowerCase() : '';
  const lat = roundCoordinate(item.lat, 4);
  const lng = roundCoordinate(item.lng, 4);
  return `place:${name || 'unknown'}:${lat},${lng}`;
};

const fallbackPlaceKey = (item: DiscoveryItem): string => {
  const name = item.name ? item.name.trim().toLowerCase() : '';
  const lat = roundCoordinate(item.lat, 4);
  const lng = roundCoordinate(item.lng, 4);
  return `place:${name || 'unknown'}:${lat},${lng}`;
};

const mergeActivitiesWithFallback = (
  primary: DiscoveryItem[],
  fallback: DiscoveryItem[],
): DiscoveryItem[] => {
  const activityIds = new Set<string>();
  const occupiedPlaces = new Set<string>();
  const result: DiscoveryItem[] = [];

  primary.forEach((item) => {
    if (activityIds.has(item.id)) return;
    activityIds.add(item.id);
    result.push(item);
    occupiedPlaces.add(placeKeyForItem(item));
    occupiedPlaces.add(fallbackPlaceKey(item));
  });

  const fallbackPlaces = new Set<string>();
  fallback.forEach((item) => {
    const key = placeKeyForItem(item);
    if (occupiedPlaces.has(key) || fallbackPlaces.has(key)) return;
    fallbackPlaces.add(key);
    result.push(item);
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

const applyFilterSupport = (
  current: DiscoveryFilterSupport,
  next: DiscoveryFilterSupport,
): DiscoveryFilterSupport => ({
  activityTypes: current.activityTypes && next.activityTypes,
  tags: current.tags && next.tags,
  traits: current.traits && next.traits,
  taxonomyCategories: current.taxonomyCategories && next.taxonomyCategories,
  priceLevels: current.priceLevels && next.priceLevels,
  capacityKey: current.capacityKey && next.capacityKey,
  timeWindow: current.timeWindow && next.timeWindow,
});

const filterByQuery = (
  items: DiscoveryItem[],
  filters: NormalizedDiscoveryFilters,
  support: DiscoveryFilterSupport,
) => {
  const wantTypes = support.activityTypes ? normalizeList(filters.activityTypes) : [];
  const wantTags = support.tags ? normalizeList(filters.tags) : [];
  const wantTraits = support.traits ? normalizeList(filters.traits) : [];
  const wantCategories = support.taxonomyCategories ? normalizeList(filters.taxonomyCategories) : [];
  const wantPrices: number[] = support.priceLevels ? filters.priceLevels : [];
  const wantCapacity = support.capacityKey && filters.capacityKey !== 'any' ? filters.capacityKey : null;
  const wantTimeWindow = support.timeWindow && filters.timeWindow !== 'any' ? filters.timeWindow : null;

  if (
    !wantTypes.length &&
    !wantTags.length &&
    !wantTraits.length &&
    !wantCategories.length &&
    !wantPrices.length &&
    !wantCapacity &&
    !wantTimeWindow
  ) {
    return items;
  }

  return items.filter((item) => {
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
  const limited = orderDiscoveryItems(filteredItems).slice(0, query.limit);
  return {
    center: query.center,
    radiusMeters: normalizeRadius(query.radiusMeters),
    count: limited.length,
    items: limited,
    filterSupport: entry.filterSupport,
    facets: buildFacets(limited),
    sourceBreakdown: buildSourceBreakdown(limited),
    source: entry.source,
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
  ai_activity_tags?: string[] | null;
  verified_activities?: string[] | null;
  updated_at?: string | null;
};

type UpcomingSessionRow = {
  activity_id: string | null;
};

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

const parseTagList = (value?: string) =>
  (value ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);

const buildOverpassQuery = (lat: number, lng: number, radius: number, limit: number) => `
[out:json][timeout:25];
(
  node(around:${radius},${lat},${lng})["leisure"~"^(sports_centre|fitness_centre|stadium|pitch|park)$"];
  node(around:${radius},${lat},${lng})["amenity"~"^(gym|sports_hall|swimming_pool|community_centre)$"];
  node(around:${radius},${lat},${lng})["sport"];
  way(around:${radius},${lat},${lng})["leisure"~"^(sports_centre|fitness_centre|stadium|pitch|park)$"];
  way(around:${radius},${lat},${lng})["amenity"~"^(gym|sports_hall|swimming_pool|community_centre)$"];
  way(around:${radius},${lat},${lng})["sport"];
  relation(around:${radius},${lat},${lng})["sport"];
);
out center ${limit};
`;

const describeVenue = (tags: Record<string, string> | undefined): string | null => {
  if (!tags) return null;
  const parts = [tags['addr:street'], tags['addr:city']].filter(Boolean);
  if (parts.length) return parts.join(', ');
  if (tags['addr:full']) return tags['addr:full'];
  if (tags['addr:neighbourhood']) return tags['addr:neighbourhood'];
  return null;
};

const toMapActivityFromVenue = (
  row: VenueFallbackRow,
  origin: { lat: number; lng: number },
): DiscoveryItem | null => {
  if (!row?.id) return null;
  const lat = sanitizeCoordinate(row.lat);
  const lng = sanitizeCoordinate(row.lng);
  if (lat == null || lng == null) return null;
  const placeLabel = normalizePlaceLabel(row.name, row.address);
  return {
    id: `venue:${row.id}`,
    name: typeof row.name === 'string' && row.name.trim() ? row.name : 'Nearby venue',
    venue: row.address ?? null,
    place_id: null,
    place_label: placeLabel,
    lat,
    lng,
    distance_m: haversineMeters(origin.lat, origin.lng, lat, lng),
    activity_types: displayStringList(row.verified_activities ?? null),
    tags: displayStringList(row.ai_activity_tags ?? null),
    traits: null,
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
  const buildVenueQuery = () => {
    const columns = [...baseColumns];
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
    .sort((a, b) => a.distance_m - b.distance_m);

  const support: DiscoveryFilterSupport = {
    activityTypes: includeVerified,
    tags: includeTags,
    traits: false,
    taxonomyCategories: false,
    priceLevels: false,
    capacityKey: false,
    timeWindow: false,
  };

  return { items, support };
};

const fetchOverpassActivities = async (query: DiscoveryQuery) => {
  const safeRadius = Math.max(250, Math.min(query.radiusMeters, 5000));
  const cappedLimit = Math.max(60, Math.min(query.limit * 3, 180));
  const overpassQuery = buildOverpassQuery(query.center.lat, query.center.lng, safeRadius, cappedLimit);

  const response = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: new URLSearchParams({ data: overpassQuery }).toString(),
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed (${response.status})`);
  }

  const payload = (await response.json()) as { elements?: OverpassElement[] };
  const elements = (payload.elements ?? []).filter((row) => row);

  const activities: DiscoveryItem[] = [];

  for (const element of elements) {
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;

    const tags = element.tags ?? {};
    const sports = parseTagList(tags.sport);
    const leisure = parseTagList(tags.leisure);
    const amenities = parseTagList(tags.amenity);
    const label =
      tags.name || sports[0] || leisure[0] || amenities[0] || tags['club'] || 'Local activity';
    const venueDescription = describeVenue(tags);
    const placeLabel = normalizePlaceLabel(venueDescription, label);

    const distance = haversineMeters(query.center.lat, query.center.lng, lat, lng);

    const combinedTags = Array.from(
      new Set<string>([
        ...sports,
        ...leisure,
        ...amenities,
        ...(tags.club ? parseTagList(tags.club) : []),
        ...(tags.cuisine ? parseTagList(tags.cuisine) : []),
        'osm',
      ]),
    );

    activities.push({
      id: `${element.type}:${element.id}`,
      name: label,
      venue: venueDescription,
      place_id: null,
      place_label: placeLabel,
      lat,
      lng,
      distance_m: distance,
      activity_types: sports.length ? sports : leisure.length ? leisure : null,
      tags: combinedTags.length ? combinedTags : null,
      traits: null,
      source: 'osm-overpass',
    });
  }

  return {
    items: activities.sort((a, b) => a.distance_m - b.distance_m),
    support: {
      activityTypes: true,
      tags: true,
      traits: false,
      taxonomyCategories: false,
      priceLevels: false,
      capacityKey: false,
      timeWindow: false,
    } satisfies DiscoveryFilterSupport,
  };
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
        support: {
          activityTypes: true,
          tags: true,
          traits: true,
          taxonomyCategories: true,
          priceLevels: true,
          capacityKey: true,
          timeWindow: true,
        },
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
        return {
          id: row.id,
          name: row.name,
          venue: row.venue,
          place_id: row.place_id ?? null,
          place_label: normalizePlaceLabel(row.place_label ?? null, row.venue ?? null, row.name ?? null),
          lat,
          lng,
          distance_m: row.distance_m ?? 0,
          activity_types: row.activity_types ?? null,
          tags: row.tags ?? null,
          traits: row.traits ?? null,
          source: 'postgis',
        };
      })
      .filter((row): row is DiscoveryItem => Boolean(row));

    return {
      items,
      support: {
        activityTypes: true,
        tags: true,
        traits: true,
        taxonomyCategories: true,
        priceLevels: true,
        capacityKey: true,
        timeWindow: true,
      },
      source: items.length ? 'postgis' : null,
    };
  } catch (error) {
    console.warn('activities_nearby RPC exception, falling back:', error);
    return {
      items: [],
      support: {
        activityTypes: true,
        tags: true,
        traits: true,
        taxonomyCategories: true,
        priceLevels: true,
        capacityKey: true,
        timeWindow: true,
      },
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

  let includePreferences = Boolean(query.filters?.traits?.length);
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

  const chosen = withinRadius.slice(0, query.limit);
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

  const items = chosen.map((row) => {
    const prefTraits = (row.participant_preferences ?? []).flatMap((pref) =>
      (pref?.preferred_traits ?? []).filter((trait): trait is string => typeof trait === 'string'),
    );
    const uniqueTraits = Array.from(
      new Set<string>([
        ...((row.traits ?? []).filter((trait): trait is string => typeof trait === 'string')),
        ...prefTraits,
      ]),
    );

    return {
      id: row.id,
      name: row.name,
      venue: row.venue,
      place_id: row.place_id ?? null,
      place_label: normalizePlaceLabel(row.place_label ?? null, row.venue ?? null, row.name ?? null),
      lat: row.lat as number,
      lng: row.lng as number,
      distance_m: row.distance,
      activity_types: row.activity_types ?? null,
      tags: row.tags ?? null,
      traits: uniqueTraits.length ? uniqueTraits : null,
      upcoming_session_count: upcomingCounts[row.id] ?? 0,
      source: 'activities',
    } satisfies DiscoveryItem;
  });

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
  const { data, error } = await client
    .from('places')
    .select('id,name')
    .in('id', placeIds);
  if (error) {
    console.warn('[nearby] failed to hydrate place labels', error.message ?? error);
    return activities;
  }
  const placeMap = new Map<string, { id: string; name: string | null }>();
  (data ?? []).forEach((row) => {
    if (row?.id) {
      placeMap.set(row.id, { id: row.id, name: row.name ?? null });
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
    };
  });
};

type DiscoverNearbyOptions = {
  bypassCache?: boolean;
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

  if (!bypassCache && entry) {
    return buildCacheResult(entry, normalizedQuery, cacheKey);
  }

  const supabase = db();
  const filterSupportDefault: DiscoveryFilterSupport = {
    activityTypes: true,
    tags: true,
    traits: true,
    taxonomyCategories: true,
    priceLevels: true,
    capacityKey: true,
    timeWindow: true,
  };
  let filterSupport = filterSupportDefault;

  const rpcResult = await fetchActivitiesFromRpc(supabase, normalizedQuery);
  let activities = filterByQuery(rpcResult.items, normalizedFilters, rpcResult.support);
  filterSupport = applyFilterSupport(filterSupport, rpcResult.support);
  const source = rpcResult.source ?? undefined;

  const fallbackResult = await fetchActivitiesFallback(supabase, normalizedQuery);
  const fallbackItems = filterByQuery(fallbackResult.items, normalizedFilters, fallbackResult.support);
  filterSupport = applyFilterSupport(filterSupport, fallbackResult.support);

  activities = mergeActivitiesWithFallback(activities, fallbackItems);

  let fallbackMeta: { degraded?: boolean; fallbackError?: string; fallbackSource?: string } = {};

  if (activities.length < normalizedQuery.limit) {
    try {
      const overpassResult = await fetchOverpassActivities(normalizedQuery);
      const filteredOverpass = filterByQuery(overpassResult.items, normalizedFilters, overpassResult.support);
      if (filteredOverpass.length) {
        filterSupport = applyFilterSupport(filterSupport, overpassResult.support);
        activities = mergeActivitiesWithFallback(activities, filteredOverpass);
        fallbackMeta.fallbackSource = fallbackMeta.fallbackSource ?? 'osm-overpass';
      }
    } catch (fallbackError) {
      console.warn('[nearby] fallback append failed', fallbackError);
      if (!fallbackMeta.degraded) {
        fallbackMeta = {
          degraded: true,
          fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        };
      }
    }
  }

  if (activities.length < normalizedQuery.limit) {
    try {
      const venueFallback = await fetchVenueFallbackActivities(supabase, normalizedQuery, normalizedQuery.limit);
      const filteredVenueFallback = filterByQuery(venueFallback.items, normalizedFilters, venueFallback.support);
      if (filteredVenueFallback.length) {
        filterSupport = applyFilterSupport(filterSupport, venueFallback.support);
        activities = mergeActivitiesWithFallback(activities, filteredVenueFallback);
        fallbackMeta.fallbackSource = fallbackMeta.fallbackSource ?? 'supabase-venues';
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

  const metadataResult = await hydrateActivitiesMetadata(supabase, activities);
  activities = metadataResult.items;
  filterSupport = applyFilterSupport(filterSupport, {
    activityTypes: true,
    tags: true,
    traits: true,
    taxonomyCategories: metadataResult.support.taxonomyCategories,
    priceLevels: metadataResult.support.priceLevels,
    capacityKey: metadataResult.support.capacityKey,
    timeWindow: metadataResult.support.timeWindow,
  });
  activities = filterByQuery(activities, normalizedFilters, filterSupport);

  const ordered = orderDiscoveryItems(activities).slice(0, normalizedQuery.limit);
  const hydrated = await hydrateActivitiesWithPlaces(supabase, ordered);
  const deduped = mergeActivitiesWithFallback(hydrated, []);
  const limited = deduped.slice(0, normalizedQuery.limit);

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
    ...fallbackMeta,
  };

  const cacheEntry = ensureCacheEntry(result);
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
  const { results, debug, filterSupport } = await searchVenueActivities({
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
      source: 'venues',
    }));

  const deduped = dedupeByPlaceKey(items);
  const ordered = orderDiscoveryItems(deduped).slice(0, normalizedQuery.limit);

  const result: DiscoveryResult = {
    center: normalizedQuery.center,
    radiusMeters: normalizedQuery.radiusMeters,
    count: ordered.length,
    items: ordered,
    filterSupport:
      filterSupport ?? {
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
