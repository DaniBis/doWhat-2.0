import type { CapacityFilterKey, TimeWindowKey } from '@dowhat/shared';

import { discoverNearbyActivities } from '@/lib/discovery/engine';
import { recordDiscoveryExposure } from '@/lib/discovery/telemetry';
import { parseNearbyQuery } from '@/lib/filters';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const AUTO_EXPAND_MIN_RESULTS_FILTERED = 18;
const AUTO_EXPAND_MIN_RESULTS_INVENTORY = 500;
const AUTO_EXPAND_MAX_RADIUS_INVENTORY_METERS = 12_500;
const AUTO_EXPAND_MAX_RADIUS_FILTERED_METERS = 25_000;
const AUTO_EXPAND_RADIUS_BUCKETS = [1200, 2000, 3200, 5000, 7500, 10000, 15000, 20000, 25000];

const normalizeCapacityKey = (value: string | null | undefined): CapacityFilterKey | undefined => {
  if (value === 'couple' || value === 'small' || value === 'medium' || value === 'large') return value;
  return undefined;
};

const normalizeTimeWindow = (value: string | null | undefined): TimeWindowKey | undefined => {
  if (value === 'open_now' || value === 'morning' || value === 'afternoon' || value === 'evening' || value === 'late') {
    return value;
  }
  return undefined;
};

const nextRadiusBucket = (radiusMeters: number): number | null => {
  for (const bucket of AUTO_EXPAND_RADIUS_BUCKETS) {
    if (bucket > radiusMeters) return bucket;
  }
  return null;
};

const hasDiscoveryFilters = (input: {
  activityTypes?: string[] | null;
  tags?: string[] | null;
  traits?: string[] | null;
  taxonomyCategories?: string[] | null;
  priceLevels?: number[] | null;
  capacityKey?: string | null;
  timeWindow?: string | null;
}) =>
  Boolean(
    (input.activityTypes?.length ?? 0)
    || (input.tags?.length ?? 0)
    || (input.traits?.length ?? 0)
    || (input.taxonomyCategories?.length ?? 0)
    || (input.priceLevels?.length ?? 0)
    || input.capacityKey
    || input.timeWindow,
  );

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = parseNearbyQuery(searchParams);

  if (!Number.isFinite(q.lat) || !Number.isFinite(q.lng)) {
    return Response.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  const radiusMeters = Math.max(q.radiusMeters ?? 2000, 100);
  const limit = Math.max(q.limit ?? 50, 1);
  const resolvedFilters = {
    activityTypes: q.activityTypes?.length ? q.activityTypes : undefined,
    tags: q.tags?.length ? q.tags : undefined,
    traits: q.traits?.length ? q.traits : undefined,
    taxonomyCategories: q.taxonomyCategories?.length ? q.taxonomyCategories : undefined,
    priceLevels: q.priceLevels?.length ? Array.from(new Set(q.priceLevels)) : undefined,
    capacityKey: normalizeCapacityKey(q.capacityKey),
    timeWindow: normalizeTimeWindow(q.timeWindow),
  };
  const hasFilters = hasDiscoveryFilters({
    activityTypes: resolvedFilters.activityTypes,
    tags: resolvedFilters.tags,
    traits: resolvedFilters.traits,
    taxonomyCategories: resolvedFilters.taxonomyCategories,
    priceLevels: resolvedFilters.priceLevels,
    capacityKey: q.capacityKey,
    timeWindow: q.timeWindow,
  });

  try {
    let result = await discoverNearbyActivities(
      {
        center: { lat: q.lat, lng: q.lng },
        radiusMeters,
        limit,
        filters: resolvedFilters,
      },
      {
        bypassCache: Boolean(q.refresh),
        includeDebug: Boolean(q.explain || q.debug),
        debugMetrics: Boolean(q.debug),
      },
    );
    let radiusExpansion:
      | { fromRadiusMeters: number; toRadiusMeters: number; note: string; previousCount: number; expandedCount: number }
      | undefined;
    const targetResultCount = hasFilters
      ? AUTO_EXPAND_MIN_RESULTS_FILTERED
      : AUTO_EXPAND_MIN_RESULTS_INVENTORY;
    const maxExpansionRadius = hasFilters
      ? AUTO_EXPAND_MAX_RADIUS_FILTERED_METERS
      : AUTO_EXPAND_MAX_RADIUS_INVENTORY_METERS;
    const maxExpansionSteps = AUTO_EXPAND_RADIUS_BUCKETS.length;
    if (result.count < targetResultCount) {
      const initialRadius = radiusMeters;
      const initialCount = result.count;
      let bestResult = result;
      let bestRadius = radiusMeters;
      let currentRadius = radiusMeters;
      let steps = 0;

      while (steps < maxExpansionSteps) {
        const nextRadius = nextRadiusBucket(currentRadius);
        if (!nextRadius || nextRadius > maxExpansionRadius) break;
        steps += 1;

        const expanded = await discoverNearbyActivities(
          {
            center: { lat: q.lat, lng: q.lng },
            radiusMeters: nextRadius,
            limit,
            filters: resolvedFilters,
          },
          {
            bypassCache: Boolean(q.refresh),
            includeDebug: Boolean(q.explain || q.debug),
            debugMetrics: false,
          },
        );
        currentRadius = nextRadius;

        if (expanded.count > bestResult.count) {
          bestResult = expanded;
          bestRadius = nextRadius;
        }
        if (bestResult.count >= targetResultCount) break;
      }

      if (bestResult.count > result.count) {
        radiusExpansion = {
          fromRadiusMeters: initialRadius,
          toRadiusMeters: bestRadius,
          note: hasFilters
            ? `Expanded search radius from ${initialRadius}m to ${bestRadius}m due to sparse filtered results.`
            : `Expanded search radius from ${initialRadius}m to ${bestRadius}m to surface more nearby venues.`,
          previousCount: initialCount,
          expandedCount: bestResult.count,
        };
        result = bestResult;
      }
    }

    if (q.debug && process.env.NODE_ENV !== 'production') {
      console.info('[nearby.debug.summary]', JSON.stringify({
        providerCounts: result.providerCounts ?? null,
        cacheHit: result.cache?.hit ?? false,
        source: result.source ?? null,
        dropped: result.debug?.dropped ?? null,
      }));
    }

    void recordDiscoveryExposure({
      requestId: request.headers?.get?.('x-request-id') ?? null,
      query: {
        lat: q.lat,
        lng: q.lng,
        radiusMeters,
        limit,
        filtersApplied: [
          q.activityTypes?.length ?? 0,
          q.tags?.length ?? 0,
          q.traits?.length ?? 0,
          q.taxonomyCategories?.length ?? 0,
          q.priceLevels?.length ?? 0,
          q.capacityKey ? 1 : 0,
          q.timeWindow ? 1 : 0,
        ].reduce((sum, value) => sum + value, 0),
      },
      result,
    });

    return Response.json({
      center: result.center,
      radiusMeters: result.radiusMeters,
      count: result.count,
      activities: result.items,
      filterSupport: result.filterSupport,
      facets: result.facets,
      sourceBreakdown: result.sourceBreakdown,
      providerCounts: result.providerCounts,
      cache: result.cache,
      source: result.source,
      degraded: result.degraded,
      fallbackError: result.fallbackError,
      fallbackSource: result.fallbackSource,
      radiusExpansion,
      debug: q.explain || q.debug ? result.debug : undefined,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    const isFetchFailure = message.toLowerCase().includes('fetch failed');
    if (isFetchFailure && process.env.NODE_ENV !== 'production') {
      return Response.json({
        center: { lat: q.lat, lng: q.lng },
        radiusMeters,
        count: 0,
        activities: [],
        degraded: true,
        fallbackError: message,
        fallbackSource: 'network',
      });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
