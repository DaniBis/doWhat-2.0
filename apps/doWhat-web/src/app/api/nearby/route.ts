import type { CapacityFilterKey, TimeWindowKey } from '@dowhat/shared';

import { discoverNearbyActivities } from '@/lib/discovery/engine';
import { parseNearbyQuery } from '@/lib/filters';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = parseNearbyQuery(searchParams);

  if (!Number.isFinite(q.lat) || !Number.isFinite(q.lng)) {
    return Response.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  const radiusMeters = Math.max(q.radiusMeters ?? 2000, 100);
  const limit = Math.max(q.limit ?? 50, 1);

  try {
    const result = await discoverNearbyActivities(
      {
        center: { lat: q.lat, lng: q.lng },
        radiusMeters,
        limit,
        filters: {
          activityTypes: q.activityTypes?.length ? q.activityTypes : undefined,
          tags: q.tags?.length ? q.tags : undefined,
          traits: q.traits?.length ? q.traits : undefined,
          taxonomyCategories: q.taxonomyCategories?.length ? q.taxonomyCategories : undefined,
          priceLevels: q.priceLevels?.length ? Array.from(new Set(q.priceLevels)) : undefined,
          capacityKey: normalizeCapacityKey(q.capacityKey),
          timeWindow: normalizeTimeWindow(q.timeWindow),
        },
      },
      { bypassCache: Boolean(q.refresh) },
    );

    return Response.json({
      center: result.center,
      radiusMeters: result.radiusMeters,
      count: result.count,
      activities: result.items,
      filterSupport: result.filterSupport,
      facets: result.facets,
      sourceBreakdown: result.sourceBreakdown,
      cache: result.cache,
      source: result.source,
      degraded: result.degraded,
      fallbackError: result.fallbackError,
      fallbackSource: result.fallbackSource,
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
