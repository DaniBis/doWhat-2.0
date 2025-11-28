import ngeohash from 'ngeohash';

import {
  getCityCategoryConfigMap,
  getCityConfig,
  type ActivityTier3WithAncestors,
  type CityCategoryConfig,
} from '@dowhat/shared';

import { getCachedTaxonomy, getCachedTier3Index, loadTaxonomy } from '@/lib/taxonomy';

import { getOptionalServiceClient } from '@/lib/supabase/service';

import { expandCategoryAliases, NORMALIZED_CATEGORIES, type NormalizedCategory } from './categories';
import { fetchFoursquarePlaces } from './providers/foursquare';
import { fetchGooglePlaces } from './providers/google';
import { fetchOverpassPlaces } from './providers/osm';
import {
  defaultAttribution,
  ensureArray,
  haversineMeters,
  mergeCategories,
  jaroWinklerSimilarity,
  randomCacheExpiry,
  slugFromNameAndCoords,
  summariseProviderCounts,
} from './utils';
import type {
  CanonicalPlace,
  ExistingPlaceRow,
  PlaceProvider,
  PlaceSourceRow,
  PlacesFetchResult,
  PlacesQuery,
  ProviderAttribution,
  ProviderPlace,
} from './types';

const VALID_PROVIDERS: PlaceProvider[] = ['openstreetmap', 'foursquare', 'google_places'];

const logSupabaseFailure = (operation: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn('[places] supabase', operation, 'failed; continuing without persistence', message);
};

const coerceProviders = (values: Array<string | null | undefined>): PlaceProvider[] =>
  values
    .map((value) => (VALID_PROVIDERS.includes(value as PlaceProvider) ? (value as PlaceProvider) : null))
    .filter((value): value is PlaceProvider => Boolean(value));

const TILE_PRECISION = 6;
const TILE_CACHE_DAYS = 30;
const TILE_CACHE_MS = TILE_CACHE_DAYS * 24 * 60 * 60 * 1000;
const DEFAULT_EXPIRY_DAYS = 21;
const DEFAULT_EXPIRY_VARIANCE = 9;
const DEDUPE_DISTANCE_METERS = 100;
const DEDUPE_NAME_SIMILARITY = 0.9;

const computeTileKey = (lat: number, lng: number): string => ngeohash.encode(lat, lng, TILE_PRECISION);

const computeBoundsCenter = (bounds: PlacesQuery['bounds']) => ({
  lat: (bounds.sw.lat + bounds.ne.lat) / 2,
  lng: (bounds.sw.lng + bounds.ne.lng) / 2,
});

const computeQueryTile = (query: PlacesQuery): { key: string; centerLat: number; centerLng: number } => {
  const center = computeBoundsCenter(query.bounds);
  return { key: computeTileKey(center.lat, center.lng), centerLat: center.lat, centerLng: center.lng };
};

const ensureCityCategoryMap = (citySlug?: string) => {
  const city = getCityConfig(citySlug);
  return {
    city,
    categoryMap: getCityCategoryConfigMap(city),
  };
};

const isTileWarm = async (
  service: ReturnType<typeof getOptionalServiceClient>,
  geohash6: string,
): Promise<boolean> => {
  if (!service || !geohash6) return false;
  try {
    const { data, error } = await service
      .from('place_tiles')
      .select('expires_at')
      .eq('geohash6', geohash6)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    if (!data?.expires_at) return false;
    return new Date(data.expires_at).getTime() > Date.now();
  } catch (error) {
    logSupabaseFailure('isTileWarm', error);
    return false;
  }
};

const upsertTileCache = async (
  service: ReturnType<typeof getOptionalServiceClient>,
  geohash6: string,
  refreshedAtIso: string,
  expiresAtIso: string,
  providerCounts: Record<PlaceProvider, number>,
) => {
  if (!service || !geohash6) return;
  try {
    const payload = {
      geohash6,
      refreshed_at: refreshedAtIso,
      expires_at: expiresAtIso,
      provider_counts: providerCounts,
    };
    const { error } = await service
      .from('place_tiles')
      .upsert(payload, { onConflict: 'geohash6' });
    if (error) throw error;
  } catch (error) {
    logSupabaseFailure('upsertTileCache', error);
  }
};

const normaliseTag = (value: string) => value.trim().toLowerCase().replace(/[^0-9a-z]+/g, '_');

type NormalisedTermSets = {
  categories: Set<string>;
  tags: Set<string>;
};

const buildTaxonomyTagMap = (index: ActivityTier3WithAncestors[]) => {
  const map = new Map<string, string[]>();
  index.forEach((entry) => {
    const tags = entry.tags.map(normaliseTag).filter(Boolean);
    if (tags.length) {
      map.set(entry.id, tags);
    }
  });
  return map;
};

let taxonomyTagMap = buildTaxonomyTagMap(getCachedTier3Index());
let taxonomyTagVersion = getCachedTaxonomy().version;

const ensureTaxonomyTagMap = async () => {
  const data = await loadTaxonomy();
  if (taxonomyTagVersion !== data.version) {
    taxonomyTagMap = buildTaxonomyTagMap(getCachedTier3Index());
    taxonomyTagVersion = data.version;
  }
  return taxonomyTagMap;
};

const buildNormalisedTerms = (categories: string[] | undefined, tags?: string[] | null): NormalisedTermSets => ({
  categories: new Set((categories ?? []).map(normaliseTag).filter(Boolean)),
  tags: new Set((tags ?? []).map(normaliseTag).filter(Boolean)),
});

const matchesCityConfig = (candidate: NormalisedTermSets, config: CityCategoryConfig): boolean => {
  const hasCategory = config.queryCategories
    .map(normaliseTag)
    .some((category) => category && candidate.categories.has(category));
  if (!hasCategory) {
    return false;
  }
  if (config.tagFilters?.length) {
    const hasRequiredTag = config.tagFilters
      .map(normaliseTag)
      .some((tag) => tag && candidate.tags.has(tag));
    if (!hasRequiredTag) {
      return false;
    }
  }
  return true;
};

const matchesTaxonomyCategory = (candidate: NormalisedTermSets, taxonomyTags: string[] | undefined): boolean => {
  if (!taxonomyTags?.length) return false;
  return taxonomyTags.some((tag) => candidate.categories.has(tag) || candidate.tags.has(tag));
};

const matchesRawCategoryKey = (candidate: NormalisedTermSets, key: string): boolean => {
  const normalizedKey = normaliseTag(key);
  if (!normalizedKey) return false;
  return candidate.categories.has(normalizedKey) || candidate.tags.has(normalizedKey);
};

const placeMatchesCategorySelection = (
  candidate: NormalisedTermSets,
  key: string,
  categoryMap: Map<string, CityCategoryConfig>,
  taxonomyTagsById: Map<string, string[]>,
): boolean => {
  const config = categoryMap.get(key);
  if (config && matchesCityConfig(candidate, config)) {
    return true;
  }
  if (matchesTaxonomyCategory(candidate, taxonomyTagsById.get(key))) {
    return true;
  }
  return matchesRawCategoryKey(candidate, key);
};

const filterPlacesByCategories = <T extends { categories: string[]; tags?: string[] | null }>(
  places: T[],
  selectedCategories: string[] | undefined,
  categoryMap: Map<string, CityCategoryConfig>,
  taxonomyTagsById: Map<string, string[]>,
): T[] => {
  if (!selectedCategories?.length) return places;
  return places.filter((place) => {
    const candidate = buildNormalisedTerms(place.categories, place.tags);
    return selectedCategories.some((key) =>
      placeMatchesCategorySelection(candidate, key, categoryMap, taxonomyTagsById),
    );
  });
};

const computeSourceConfidence = (aggregate: PlaceAggregate): number | null => {
  if (!aggregate.confidence.size) return null;
  let total = 0;
  aggregate.confidence.forEach((value) => {
    total += value;
  });
  return Number((total / aggregate.confidence.size).toFixed(3));
};

const computePlaceScore = (
  place: CanonicalPlace,
  centerLat: number,
  centerLng: number,
  nowMs: number,
): number => {
  const distanceMeters = haversineMeters(centerLat, centerLng, place.lat, place.lng);
  const distanceScore = Math.max(0, 1 - distanceMeters / 2000);
  const ratingScore = place.rating != null && place.ratingCount
    ? Math.min(1.5, (place.rating * Math.log10(place.ratingCount + 1)) / 10)
    : 0;
  const cachedAtMs = place.cachedAt ? new Date(place.cachedAt).getTime() : null;
  const freshnessScore = cachedAtMs ? Math.max(0, 1 - (nowMs - cachedAtMs) / TILE_CACHE_MS) : 0.5;
  const confidenceScore = typeof place.metadata?.sourceConfidence === 'number' ? Number(place.metadata.sourceConfidence) : 0;
  const providerScore = Number(place.metadata?.providerCount ?? 0) > 1 ? 0.3 : 0;
  return Number((distanceScore * 2 + ratingScore + freshnessScore + confidenceScore + providerScore).toFixed(4));
};

const rankPlaces = (
  places: CanonicalPlace[],
  centerLat: number,
  centerLng: number,
  nowMs: number,
): CanonicalPlace[] => {
  const scored = places.map((place) => {
    const score = computePlaceScore(place, centerLat, centerLng, nowMs);
    place.metadata = { ...(place.metadata ?? {}), score };
    return { place, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((item) => item.place);
};

const logProviderCall = (
  provider: PlaceProvider,
  durationMs: number,
  result: { status: 'fulfilled'; count: number } | { status: 'rejected'; error: unknown },
) => {
  if (result.status === 'fulfilled') {
    console.info('[places] provider', provider, 'completed', {
      durationMs,
      count: result.count,
    });
  } else {
    console.warn('[places] provider', provider, 'failed', {
      durationMs,
      error: result.error instanceof Error ? result.error.message : result.error,
    });
  }
};

const callProvider = async <T>(
  provider: PlaceProvider,
  fn: () => Promise<T>,
): Promise<{ status: 'fulfilled'; value: T; durationMs: number } | { status: 'rejected'; reason: unknown; durationMs: number }> => {
  const started = Date.now();
  try {
    const value = await fn();
    const durationMs = Date.now() - started;
    logProviderCall(provider, durationMs, { status: 'fulfilled', count: Array.isArray(value) ? value.length : 1 });
    return { status: 'fulfilled', value, durationMs };
  } catch (error) {
    const durationMs = Date.now() - started;
    logProviderCall(provider, durationMs, { status: 'rejected', error });
    return { status: 'rejected', reason: error, durationMs };
  }
};

interface PlaceAggregate {
  id?: string;
  slug?: string | null;
  name: string;
  lat: number;
  lng: number;
  categories: Set<string>;
  tags: Set<string>;
  address?: string;
  locality?: string;
  region?: string;
  country?: string;
  postcode?: string;
  phone?: string;
  website?: string;
  ratingSamples: number[];
  ratingCountTotal: number;
  priceLevelSamples: number[];
  aggregatedFrom: Set<PlaceProvider>;
  transientProviders: Set<PlaceProvider>;
  attributions: Map<PlaceProvider, ProviderAttribution>;
  confidence: Map<PlaceProvider, number>;
  providerPlaces: ProviderPlace[];
  persistableProviderPlaces: ProviderPlace[];
  metadata: Record<string, unknown>;
  existingRow?: ExistingPlaceRow;
  needsCategoryCleanup?: boolean;
}

const toAggregateFromExisting = (
  row: ExistingPlaceRow,
  sources: PlaceSourceRow[] | undefined,
): PlaceAggregate => {
  const providerMap = new Map<PlaceProvider, ProviderAttribution>();
  const existingAttribution = (row.attribution as { providers?: Record<string, ProviderAttribution> } | null)?.providers;
  if (existingAttribution) {
    (Object.entries(existingAttribution) as Array<[PlaceProvider, ProviderAttribution]>).forEach(([key, value]) => {
      providerMap.set(key, value);
    });
  }

  const existingCategories = ensureArray(row.categories ?? []);
  const needsCategoryCleanup = existingCategories.length > 0 && hasAllNormalizedCategories(existingCategories);

  const aggregate: PlaceAggregate = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    categories: new Set(needsCategoryCleanup ? [] : existingCategories),
    tags: new Set(ensureArray(row.tags ?? [])),
    address: row.address ?? undefined,
    locality: row.locality ?? undefined,
    region: row.region ?? undefined,
    country: row.country ?? undefined,
    postcode: row.postcode ?? undefined,
    phone: row.phone ?? undefined,
    website: row.website ?? undefined,
    ratingSamples: typeof row.rating === 'number' ? [row.rating] : [],
    ratingCountTotal: typeof row.rating_count === 'number' ? row.rating_count : 0,
    priceLevelSamples: typeof row.price_level === 'number' ? [row.price_level] : [],
    aggregatedFrom: new Set(coerceProviders(ensureArray(row.aggregated_from ?? []))),
    transientProviders: new Set(),
    attributions: providerMap,
    confidence: new Map(),
    providerPlaces: [],
    persistableProviderPlaces: [],
    metadata: (row.metadata as Record<string, unknown> | undefined) ?? {},
    existingRow: row,
    needsCategoryCleanup,
  };

  if (typeof row.source_confidence === 'number') {
    aggregate.metadata.sourceConfidence = row.source_confidence;
  }

  if (sources) {
    sources.forEach((source) => {
      aggregate.aggregatedFrom.add(source.provider);
      if (!providerMap.has(source.provider)) {
        providerMap.set(source.provider, defaultAttribution(source.provider));
      }
    });
  }

  return aggregate;
};

const computePrimarySource = (aggregate: PlaceAggregate): PlaceProvider | undefined => {
  let candidate: PlaceProvider | undefined = aggregate.aggregatedFrom.values().next().value;
  let bestConfidence = candidate ? aggregate.confidence.get(candidate) ?? 0 : 0;
  aggregate.confidence.forEach((confidence, provider) => {
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      candidate = provider;
    }
  });
  return candidate;
};

const computeAverage = (values: number[]): number | undefined => {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) return undefined;
  const total = filtered.reduce((sum, value) => sum + value, 0);
  return Number((total / filtered.length).toFixed(2));
};

const computePopularityScore = (aggregate: PlaceAggregate): number | undefined => {
  const avgRating = computeAverage(aggregate.ratingSamples);
  const ratingComponent = avgRating ? avgRating * Math.log10(Math.max(aggregate.ratingCountTotal, 1) + 1) : 0;
  let confidenceComponent = 0;
  aggregate.confidence.forEach((value) => {
    confidenceComponent += value;
  });
  const score = ratingComponent + confidenceComponent;
  return score ? Number(score.toFixed(3)) : undefined;
};

const findBestMatch = (
  aggregates: PlaceAggregate[],
  candidate: ProviderPlace,
): PlaceAggregate | undefined => {
  let best: { aggregate: PlaceAggregate; score: number } | undefined;
  aggregates.forEach((aggregate) => {
    const distance = haversineMeters(aggregate.lat, aggregate.lng, candidate.lat, candidate.lng);
    if (distance > DEDUPE_DISTANCE_METERS) return;
    const similarity = jaroWinklerSimilarity(aggregate.name, candidate.name);
    if (similarity < DEDUPE_NAME_SIMILARITY) return;
    const distanceFactor = Math.max(0.1, 1 - distance / (DEDUPE_DISTANCE_METERS * 2));
    const combinedScore = similarity * distanceFactor;
    if (!best || combinedScore > best.score) {
      best = { aggregate, score: combinedScore };
    }
  });
  return best?.aggregate;
};

const applyProviderPlace = (
  aggregate: PlaceAggregate,
  providerPlace: ProviderPlace,
  opts: { persistable: boolean },
) => {
  aggregate.providerPlaces.push(providerPlace);
  if (opts.persistable) {
    aggregate.persistableProviderPlaces.push(providerPlace);
    aggregate.aggregatedFrom.add(providerPlace.provider);
  } else {
    aggregate.transientProviders.add(providerPlace.provider);
  }

  const attribution = providerPlace.attribution || defaultAttribution(providerPlace.provider);
  aggregate.attributions.set(providerPlace.provider, attribution);

  if (typeof providerPlace.confidence === 'number') {
    const prev = aggregate.confidence.get(providerPlace.provider) ?? 0;
    aggregate.confidence.set(providerPlace.provider, Math.max(prev, providerPlace.confidence));
  }

  if (aggregate.needsCategoryCleanup && aggregate.categories.size === 0) {
    aggregate.categories = new Set(providerPlace.categories);
    if (providerPlace.categories.length) {
      aggregate.needsCategoryCleanup = false;
    }
  } else {
    aggregate.categories = new Set(mergeCategories(Array.from(aggregate.categories), providerPlace.categories));
  }
  aggregate.tags = new Set(mergeCategories(Array.from(aggregate.tags), providerPlace.tags));

  if (!aggregate.address && providerPlace.address) aggregate.address = providerPlace.address;
  if (!aggregate.locality && providerPlace.locality) aggregate.locality = providerPlace.locality;
  if (!aggregate.region && providerPlace.region) aggregate.region = providerPlace.region;
  if (!aggregate.country && providerPlace.country) aggregate.country = providerPlace.country;
  if (!aggregate.postcode && providerPlace.postcode) aggregate.postcode = providerPlace.postcode;
  if (!aggregate.phone && providerPlace.phone) aggregate.phone = providerPlace.phone;
  if (!aggregate.website && providerPlace.website) aggregate.website = providerPlace.website;

  if (typeof providerPlace.rating === 'number') aggregate.ratingSamples.push(providerPlace.rating);
  if (typeof providerPlace.ratingCount === 'number') {
    aggregate.ratingCountTotal += providerPlace.ratingCount;
  }
  if (typeof providerPlace.priceLevel === 'number') aggregate.priceLevelSamples.push(providerPlace.priceLevel);
};

const buildAttributionRecord = (aggregate: PlaceAggregate) => {
  const providers: Record<string, ProviderAttribution> = {};
  aggregate.attributions.forEach((value, key) => {
    providers[key] = value;
  });
  return { providers };
};

const toCanonicalPlace = (
  aggregate: PlaceAggregate,
  nowIso: string,
  expiryIso: string,
  opts: { transientOnly?: boolean },
): CanonicalPlace => {
  const avgRating = computeAverage(aggregate.ratingSamples);
  const avgPriceLevel = computeAverage(aggregate.priceLevelSamples);
  const popularityScore = computePopularityScore(aggregate);

  return {
    id: aggregate.id ?? slugFromNameAndCoords(aggregate.name, aggregate.lat, aggregate.lng),
    slug: aggregate.slug ?? null,
    name: aggregate.name,
    lat: aggregate.lat,
    lng: aggregate.lng,
    categories: Array.from(aggregate.categories),
    tags: Array.from(aggregate.tags),
    address: aggregate.address,
    locality: aggregate.locality,
    region: aggregate.region,
    country: aggregate.country,
    postcode: aggregate.postcode,
    phone: aggregate.phone,
    website: aggregate.website,
    rating: avgRating,
    ratingCount: aggregate.ratingCountTotal || undefined,
    priceLevel: avgPriceLevel,
    popularityScore: popularityScore,
    aggregatedFrom: Array.from(aggregate.aggregatedFrom),
    primarySource: computePrimarySource(aggregate),
    cacheExpiresAt: opts.transientOnly ? undefined : expiryIso,
    cachedAt: opts.transientOnly ? undefined : nowIso,
    attributions: Array.from(aggregate.attributions.entries()).map(([provider, attr]) => ({
      provider,
      ...attr,
    })),
    metadata: {
      ...(aggregate.metadata || {}),
      providerCount: aggregate.providerPlaces.length,
      transientProviders: Array.from(aggregate.transientProviders),
      geohash6: aggregate.existingRow?.geohash6 ?? computeTileKey(aggregate.lat, aggregate.lng),
    },
    transient: opts.transientOnly ? true : undefined,
  };
};

const upsertPlaces = async (
  service: ReturnType<typeof getOptionalServiceClient>,
  aggregates: PlaceAggregate[],
  nowIso: string,
  expiryIso: string,
) => {
  if (!service || !aggregates.length) return;

  try {
    const mergeBySlug = (items: PlaceAggregate[]): PlaceAggregate[] => {
      const map = new Map<string, PlaceAggregate>();
      const result: PlaceAggregate[] = [];
      items.forEach((aggregate) => {
      const slug = aggregate.slug ?? slugFromNameAndCoords(aggregate.name, aggregate.lat, aggregate.lng);
      aggregate.slug = slug;
      const existing = map.get(slug);
      if (existing && existing !== aggregate) {
        aggregate.categories.forEach((value) => existing.categories.add(value));
        aggregate.tags.forEach((value) => existing.tags.add(value));
        aggregate.ratingSamples.forEach((value) => existing.ratingSamples.push(value));
        existing.ratingCountTotal += aggregate.ratingCountTotal;
        aggregate.priceLevelSamples.forEach((value) => existing.priceLevelSamples.push(value));
        aggregate.aggregatedFrom.forEach((value) => existing.aggregatedFrom.add(value));
        aggregate.transientProviders.forEach((value) => existing.transientProviders.add(value));
        aggregate.providerPlaces.forEach((value) => existing.providerPlaces.push(value));
        aggregate.persistableProviderPlaces.forEach((value) => existing.persistableProviderPlaces.push(value));
        aggregate.attributions.forEach((value, key) => existing.attributions.set(key, value));
        aggregate.confidence.forEach((value, key) => {
          const prev = existing.confidence.get(key) ?? 0;
          if (value > prev) existing.confidence.set(key, value);
        });
        existing.metadata = { ...aggregate.metadata, ...existing.metadata };
        if (aggregate.needsCategoryCleanup) {
          existing.needsCategoryCleanup = true;
        }
      } else if (!existing) {
        map.set(slug, aggregate);
        result.push(aggregate);
      }
    });
      return result;
    };

    const mergedAggregates = mergeBySlug(aggregates);

    const aggregatesMissingId = mergedAggregates.filter((aggregate) => !aggregate.id);
    if (aggregatesMissingId.length) {
      const slugsToLookup = Array.from(
        new Set(
          aggregatesMissingId.map((aggregate) => {
          if (!aggregate.slug) {
            aggregate.slug = slugFromNameAndCoords(aggregate.name, aggregate.lat, aggregate.lng);
          }
          return aggregate.slug ?? null;
        }),
      ),
    ).filter((slug): slug is string => Boolean(slug));

    if (slugsToLookup.length) {
      const { data: existingBySlug, error: lookupError } = await service
        .from('places')
        .select('id, slug')
        .in('slug', slugsToLookup);
      if (lookupError) throw lookupError;

      existingBySlug?.forEach((row) => {
        const match = aggregatesMissingId.find((aggregate) => aggregate.slug === row.slug);
        if (match) {
          match.id = row.id;
        }
      });
      }

    }

    const rows = mergedAggregates.map((aggregate) => {
      const avgRating = computeAverage(aggregate.ratingSamples);
    const avgPriceLevel = computeAverage(aggregate.priceLevelSamples);
    const popularityScore = computePopularityScore(aggregate);
    const aggregatedFrom = Array.from(aggregate.aggregatedFrom);
    const attributionRecord = buildAttributionRecord(aggregate);
    const sourceConfidence = computeSourceConfidence(aggregate);
    const metadata = {
      ...(aggregate.metadata || {}),
      providerCount: aggregate.providerPlaces.length,
      transientProviders: Array.from(aggregate.transientProviders),
      sourceConfidence,
    };
    const slug = aggregate.slug ?? slugFromNameAndCoords(aggregate.name, aggregate.lat, aggregate.lng);
    aggregate.slug = slug;
    const geohash6 = computeTileKey(aggregate.lat, aggregate.lng);

    const row: {
      slug: string;
      name: string;
      categories: string[];
      tags: string[];
      address: string | null;
      locality: string | null;
      region: string | null;
      country: string | null;
      postcode: string | null;
      lat: number;
      lng: number;
      phone: string | null;
      website: string | null;
      rating: number | null;
      rating_count: number | null;
      price_level: number | null;
      popularity_score: number | null;
      aggregated_from: string[];
      primary_source: PlaceProvider | null;
      attribution: ReturnType<typeof buildAttributionRecord>;
      metadata: Record<string, unknown>;
      cached_at: string;
      cache_expires_at: string;
      last_seen_at: string;
      geohash6: string | null;
      source_confidence: number | null;
    } = {
      slug,
      name: aggregate.name,
      categories: Array.from(aggregate.categories),
      tags: Array.from(aggregate.tags),
      address: aggregate.address ?? null,
      locality: aggregate.locality ?? null,
      region: aggregate.region ?? null,
      country: aggregate.country ?? null,
      postcode: aggregate.postcode ?? null,
      lat: aggregate.lat,
      lng: aggregate.lng,
      phone: aggregate.phone ?? null,
      website: aggregate.website ?? null,
      rating: avgRating ?? null,
      rating_count: aggregate.ratingCountTotal || null,
      price_level: avgPriceLevel ?? null,
      popularity_score: popularityScore ?? null,
      aggregated_from: aggregatedFrom,
      primary_source: computePrimarySource(aggregate) ?? null,
      attribution: attributionRecord,
      metadata,
      cached_at: nowIso,
      cache_expires_at: expiryIso,
      last_seen_at: nowIso,
      geohash6,
      source_confidence: sourceConfidence ?? null,
    };

      return row;
    });

    const { data, error } = await service
      .from('places')
      .upsert(rows, { onConflict: 'slug' })
      .select('id, slug');
    if (error) throw error;

    // Update aggregate IDs with returned values (for new inserts)
    data?.forEach((row) => {
      const aggregate = mergedAggregates.find((item) => item.slug === row.slug || item.id === row.id);
      if (aggregate) {
        aggregate.id = row.id;
        aggregate.slug = row.slug;
      }
    });

    // Ensure caller receives merged aggregates with consistent IDs
    aggregates.splice(0, aggregates.length, ...mergedAggregates);
  } catch (error) {
    logSupabaseFailure('upsertPlaces', error);
  }
};

const upsertPlaceSources = async (
  service: ReturnType<typeof getOptionalServiceClient>,
  aggregates: PlaceAggregate[],
  nowIso: string,
  expiryIso: string,
) => {
  if (!service) return;
  try {
    const rows = aggregates.flatMap((aggregate) => {
      if (!aggregate.id) return [];
      return aggregate.persistableProviderPlaces.map((providerPlace) => ({
        place_id: aggregate.id!,
        provider: providerPlace.provider,
        provider_place_id: providerPlace.providerId,
        fetched_at: nowIso,
        next_refresh_at: expiryIso,
        confidence: providerPlace.confidence ?? null,
        name: providerPlace.name,
        categories: providerPlace.categories,
        lat: providerPlace.lat,
        lng: providerPlace.lng,
        address: providerPlace.address ?? null,
        url: providerPlace.website ?? null,
        attribution: providerPlace.attribution ?? defaultAttribution(providerPlace.provider),
        raw: providerPlace.raw,
      }));
    });
    if (!rows.length) return;
    const { error } = await service.from('place_sources').upsert(rows, { onConflict: 'provider,provider_place_id' });
    if (error) throw error;
  } catch (error) {
    logSupabaseFailure('upsertPlaceSources', error);
  }
};

const fetchExisting = async (
  query: PlacesQuery,
  service: ReturnType<typeof getOptionalServiceClient>,
) => {
  if (!service) {
    return { existing: [] as ExistingPlaceRow[], sources: [] as PlaceSourceRow[] };
  }
  const minLat = Math.min(query.bounds.sw.lat, query.bounds.ne.lat);
  const maxLat = Math.max(query.bounds.sw.lat, query.bounds.ne.lat);
  const minLng = Math.min(query.bounds.sw.lng, query.bounds.ne.lng);
  const maxLng = Math.max(query.bounds.sw.lng, query.bounds.ne.lng);

  const { data, error } = await service
    .from('places')
    .select(
      `id, slug, name, categories, tags, address, locality, region, country, postcode, lat, lng, phone, website, popularity_score, rating, rating_count, price_level, aggregated_from, primary_source, attribution, metadata, cached_at, cache_expires_at, last_seen_at, geohash6, source_confidence`,
    )
    .gte('lat', minLat)
    .lte('lat', maxLat)
    .gte('lng', minLng)
    .lte('lng', maxLng)
    .limit(Math.min(query.limit ?? 200, 400));
  if (error) throw error;
  const existing = (data ?? []) as ExistingPlaceRow[];

  if (!existing.length) {
    return { existing, sources: [] as PlaceSourceRow[] };
  }

  const placeIds = existing.map((row) => row.id);
  const chunkSize = 50;
  const chunks: string[][] = [];
  for (let index = 0; index < placeIds.length; index += chunkSize) {
    const chunk = placeIds.slice(index, index + chunkSize);
    if (chunk.length) {
      chunks.push(chunk);
    }
  }

  if (!chunks.length) {
    return { existing, sources: [] as PlaceSourceRow[] };
  }

  const sourceResults = await Promise.all(
    chunks.map((chunk) =>
      service
        .from('place_sources')
        .select(
          'id, place_id, provider, provider_place_id, fetched_at, next_refresh_at, confidence, name, categories, lat, lng, address, url, attribution, raw',
        )
        .in('place_id', chunk),
    ),
  );

  const sources: PlaceSourceRow[] = [];
  sourceResults.forEach(({ data: sourceRows, error: sourceError }) => {
    if (sourceError) throw sourceError;
    if (sourceRows?.length) {
      sources.push(...(sourceRows as PlaceSourceRow[]));
    }
  });

  return { existing, sources };
};

const allCategorySet = new Set<string>(NORMALIZED_CATEGORIES);

const hasAllNormalizedCategories = (categories: Iterable<string>): boolean => {
  const matched = new Set<string>();
  for (const category of categories) {
    if (allCategorySet.has(category)) {
      matched.add(category);
    }
  }
  return matched.size === allCategorySet.size;
};

const shouldRefresh = (
  existing: ExistingPlaceRow[],
  categories: NormalizedCategory[],
  forceRefresh?: boolean,
): boolean => {
  if (forceRefresh) return true;
  if (!existing.length) return true;
  const now = Date.now();
  const requestedCategories = new Set(categories);
  let hasValid = false;
  let needsCategoryCleanup = false;

  existing.forEach((row) => {
    const expires = row.cache_expires_at ? new Date(row.cache_expires_at).getTime() : 0;
    if (expires > now) {
      hasValid = true;
    }
    if (requestedCategories.size) {
      const rowCategories = new Set(ensureArray(row.categories ?? []));
      requestedCategories.forEach((cat) => {
        if (!hasValid || !rowCategories.has(cat)) {
          // fallthrough: we may still satisfy other categories
        }
      });
    }

    if (!needsCategoryCleanup) {
      const rowCategories = ensureArray(row.categories ?? []);
      if (rowCategories.length && hasAllNormalizedCategories(rowCategories)) {
        needsCategoryCleanup = true;
      }
    }
  });
  // Refresh if any row expired
  const expired = existing.some((row) => {
    const expires = row.cache_expires_at ? new Date(row.cache_expires_at).getTime() : 0;
    return expires <= now;
  });
  if (expired) return true;
  if (needsCategoryCleanup) return true;
  return !hasValid;
};

export const fetchPlacesForViewport = async (query: PlacesQuery): Promise<PlacesFetchResult> => {
  let service = getOptionalServiceClient();
  const normalizedCategories = expandCategoryAliases(query.categories ?? []);
  const { categoryMap } = ensureCityCategoryMap(query.city);
  const taxonomyTagsById = await ensureTaxonomyTagMap();
  const { key: tileKey, centerLat, centerLng } = computeQueryTile(query);
  let existing: ExistingPlaceRow[] = [];
  let sources: PlaceSourceRow[] = [];
  let serviceHealthy = Boolean(service);

  if (service) {
    try {
      ({ existing, sources } = await fetchExisting(query, service));
    } catch (error) {
      serviceHealthy = false;
      logSupabaseFailure('fetchExisting', error);
    }
  }

  if (!serviceHealthy) {
    service = null;
    existing = [];
    sources = [];
  }

  const tileWarm = await isTileWarm(service, tileKey);
  let refreshNeeded = shouldRefresh(existing, normalizedCategories, query.forceRefresh);
  if (tileWarm && existing.length && !query.forceRefresh) {
    refreshNeeded = false;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const expiryIso = randomCacheExpiry(DEFAULT_EXPIRY_DAYS, DEFAULT_EXPIRY_VARIANCE).toISOString();

  if (!refreshNeeded) {
    const places = existing.map<CanonicalPlace>((row) => {
      const aggregate = toAggregateFromExisting(row, sources.filter((source) => source.place_id === row.id));
      return toCanonicalPlace(aggregate, row.cached_at ?? nowIso, row.cache_expires_at ?? expiryIso, {});
    });
    const filtered = filterPlacesByCategories(places, query.categories, categoryMap, taxonomyTagsById);
    const ranked = rankPlaces(filtered, centerLat, centerLng, now.getTime());
    console.info('[places] response', {
      tileKey,
      cacheHit: true,
      placeCount: ranked.length,
    });
    return {
      places: ranked,
      cacheHit: true,
      providerCounts: { openstreetmap: 0, foursquare: 0, google_places: 0 },
    };
  }

  const existingAggregates = existing.map((row) =>
    toAggregateFromExisting(row, sources.filter((source) => source.place_id === row.id)),
  );

  const providerResults: ProviderPlace[] = [];

  const overpassCall = await callProvider('openstreetmap', () =>
    fetchOverpassPlaces({ ...query, categories: query.categories ?? [] }, { categoryMap }),
  );
  if (overpassCall.status === 'fulfilled') {
    providerResults.push(...overpassCall.value.filter((place) => place.canPersist !== false));
  }

  const _foursquareCall = await callProvider('foursquare', () =>
    fetchFoursquarePlaces({ ...query, categories: query.categories ?? [] }, { categoryMap }),
  );
  // Temporarily disabled due to deprecated API
  // if (_foursquareCall.status === 'fulfilled') {
  //   providerResults.push(..._foursquareCall.value.filter((place) => place.canPersist !== false));
  // }

  const filteredProviderResults = filterPlacesByCategories(
    providerResults,
    query.categories,
    categoryMap,
    taxonomyTagsById,
  );

  const aggregates = [...existingAggregates];

  const sourceByProviderId = new Map<string, PlaceAggregate>();
  sources.forEach((source) => {
    const key = `${source.provider}:${source.provider_place_id}`;
    const aggregate = aggregates.find((agg) => agg.id === source.place_id);
    if (aggregate && key) {
      sourceByProviderId.set(key, aggregate);
    }
  });

  filteredProviderResults.forEach((providerPlace) => {
    const key = `${providerPlace.provider}:${providerPlace.providerId}`;
    let aggregate = sourceByProviderId.get(key);
    if (!aggregate) {
      aggregate = findBestMatch(aggregates, providerPlace);
    }
    if (!aggregate) {
      aggregate = {
        name: providerPlace.name,
        lat: providerPlace.lat,
        lng: providerPlace.lng,
        categories: new Set(providerPlace.categories),
        tags: new Set(providerPlace.tags ?? []),
        ratingSamples: [],
        ratingCountTotal: 0,
        priceLevelSamples: [],
        aggregatedFrom: new Set(),
        transientProviders: new Set(),
        attributions: new Map(),
        confidence: new Map(),
        providerPlaces: [],
        persistableProviderPlaces: [],
        metadata: {},
      };
      aggregates.push(aggregate);
    }
    applyProviderPlace(aggregate, providerPlace, { persistable: true });
  });

  await upsertPlaces(service, aggregates, nowIso, expiryIso);
  await upsertPlaceSources(service, aggregates, nowIso, expiryIso);

  let workingAggregates: PlaceAggregate[];

  if (service) {
    try {
      const { existing: refreshedRows, sources: refreshedSources } = await fetchExisting(query, service);
      workingAggregates = refreshedRows.map((row) =>
        toAggregateFromExisting(row, refreshedSources.filter((source) => source.place_id === row.id)),
      );
    } catch (error) {
      logSupabaseFailure('refetchExisting', error);
      workingAggregates = aggregates;
      service = null;
    }
  } else {
    workingAggregates = aggregates;
  }

  const googleCall = await callProvider('google_places', () =>
    fetchGooglePlaces({ ...query, categories: query.categories ?? [] }),
  );
  if (googleCall.status === 'fulfilled') {
    googleCall.value.forEach((googlePlace) => {
      const match = findBestMatch(workingAggregates, googlePlace);
      if (match) {
        applyProviderPlace(match, googlePlace, { persistable: false });
      } else {
        const aggregate: PlaceAggregate = {
          name: googlePlace.name,
          lat: googlePlace.lat,
          lng: googlePlace.lng,
          categories: new Set(googlePlace.categories),
          tags: new Set(googlePlace.tags ?? []),
          ratingSamples: googlePlace.rating ? [googlePlace.rating] : [],
          ratingCountTotal: googlePlace.ratingCount ?? 0,
          priceLevelSamples: typeof googlePlace.priceLevel === 'number' ? [googlePlace.priceLevel] : [],
          aggregatedFrom: new Set(),
          transientProviders: new Set(),
          attributions: new Map(),
          confidence: new Map(),
          providerPlaces: [],
          persistableProviderPlaces: [],
          metadata: {},
        };
        applyProviderPlace(aggregate, googlePlace, { persistable: false });
        workingAggregates.push(aggregate);
      }
    });
  }

  const places = workingAggregates.map((aggregate) =>
    toCanonicalPlace(aggregate, nowIso, expiryIso, { transientOnly: !aggregate.id }),
  );

  const allProviderItems = [...filteredProviderResults];
  if (googleCall.status === 'fulfilled') {
    allProviderItems.push(...googleCall.value.filter((place) => place.canPersist !== false));
  }

  const providerCounts = summariseProviderCounts(allProviderItems);

  const tileExpiresIso = new Date(Date.now() + TILE_CACHE_MS).toISOString();
  await upsertTileCache(service, tileKey, nowIso, tileExpiresIso, providerCounts);

  const filteredPlaces = filterPlacesByCategories(places, query.categories, categoryMap, taxonomyTagsById);
  const rankedPlaces = rankPlaces(filteredPlaces, centerLat, centerLng, now.getTime());

  console.info('[places] response', {
    tileKey,
    cacheHit: false,
    providerCounts,
    placeCount: rankedPlaces.length,
  });

  return {
    places: rankedPlaces,
    cacheHit: false,
    providerCounts,
  };
};
