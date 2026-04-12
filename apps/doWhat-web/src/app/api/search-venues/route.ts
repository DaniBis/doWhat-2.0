import { NextResponse } from 'next/server';

import { rateLimit } from '@/lib/rateLimit';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';
import { discoverNearbyVenues } from '@/lib/discovery/engine';
import { haversineMeters } from '@/lib/places/utils';
import { normalizeVenueSearchActivities } from '@/lib/venues/search';
import { VENUE_SEARCH_DEFAULT_RADIUS, VENUE_SEARCH_MAX_LIMIT } from '@/lib/venues/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SEARCH_RATE_LIMIT = { capacity: 60, intervalMs: 60_000 };

export async function GET(request: Request) {
  const ipKey = rateLimitKey(request, 'search-venues');
  if (!rateLimit(ipKey, SEARCH_RATE_LIMIT)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const url = new URL(request.url);
  const activityParam = url.searchParams.get('activity');
  const activities = normalizeVenueSearchActivities(activityParam);
  if (!activities?.length) {
    return NextResponse.json({ error: 'Invalid or missing activity parameter.' }, { status: 400 });
  }
  const activity = typeof activityParam === 'string' ? activityParam.trim().toLowerCase().replace(/\s+/g, ' ') : activities[0];

  const limit = clampLimit(parseNumber(url.searchParams.get('limit')), VENUE_SEARCH_MAX_LIMIT);
  const bounds = parseBounds(url);
  const radius = bounds ? undefined : parseRadius(url);
  const includeUnverified = parseBoolean(url.searchParams.get('includeUnverified'));

  try {
    const resolvedCenter = bounds ? centerFromBounds(bounds) : radius?.center ?? null;
    if (!resolvedCenter) {
      return NextResponse.json({ error: 'Provide either sw/ne bounds or lat/lng parameters.' }, { status: 400 });
    }

    const radiusMeters = bounds
      ? Math.max(
          haversineMeters(resolvedCenter.lat, resolvedCenter.lng, bounds.ne.lat, bounds.ne.lng),
          VENUE_SEARCH_DEFAULT_RADIUS,
        )
      : radius?.radiusMeters ?? VENUE_SEARCH_DEFAULT_RADIUS;

    const venueResponses = await Promise.all(
      activities.map((candidateActivity) =>
        discoverNearbyVenues(
          {
            center: resolvedCenter,
            radiusMeters,
            limit,
            bounds: bounds ?? undefined,
          },
          candidateActivity,
          { includeUnverified },
        ),
      ),
    );

    const baseResult = venueResponses[0]?.result;
    const mergedItems = dedupeById(
      venueResponses.flatMap(({ result }) => result.items),
      (item) => item.id,
      (left, right) => ((right.rank_score ?? 0) > (left.rank_score ?? 0) ? right : left),
    ).sort((left, right) => (right.rank_score ?? 0) - (left.rank_score ?? 0)).slice(0, limit);
    const mergedVenues = dedupeById(
      venueResponses.flatMap(({ venues }) => venues),
      (venue) => venue.venueId,
      (left, right) => ((right.score ?? 0) > (left.score ?? 0) ? right : left),
    ).sort((left, right) => (right.score ?? 0) - (left.score ?? 0)).slice(0, limit);
    const debug = {
      limitApplied: limit,
      venueCount: mergedVenues.length,
      voteCount: venueResponses.reduce((sum, entry) => sum + (entry.debug?.voteCount ?? 0), 0),
    };

    if (!baseResult) {
      return NextResponse.json({ error: 'Failed to load venues.' }, { status: 500 });
    }

    return NextResponse.json({
      activity,
      results: mergedVenues,
      items: mergedItems,
      filterSupport: baseResult.filterSupport,
      facets: mergeFacetCounts(venueResponses.map(({ result }) => result.facets)),
      sourceBreakdown: mergeSourceBreakdowns(venueResponses.map(({ result }) => result.sourceBreakdown ?? {})),
      cache: baseResult.cache,
      source: activities.length > 1 ? 'family-search' : baseResult.source,
      debug,
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

function dedupeById<T>(items: T[], getId: (item: T) => string, choose: (left: T, right: T) => T): T[] {
  const byId = new Map<string, T>();
  items.forEach((item) => {
    const id = getId(item);
    const current = byId.get(id);
    byId.set(id, current ? choose(current, item) : item);
  });
  return Array.from(byId.values());
}

function mergeFacetCounts(facetsList: Array<Record<string, Array<{ value: string; count: number }>> | undefined>) {
  const merged = {
    activityTypes: [] as Array<{ value: string; count: number }>,
    tags: [] as Array<{ value: string; count: number }>,
    traits: [] as Array<{ value: string; count: number }>,
    taxonomyCategories: [] as Array<{ value: string; count: number }>,
    priceLevels: [] as Array<{ value: string; count: number }>,
    capacityKey: [] as Array<{ value: string; count: number }>,
    timeWindow: [] as Array<{ value: string; count: number }>,
  };
  (Object.keys(merged) as Array<keyof typeof merged>).forEach((key) => {
    const counts = new Map<string, number>();
    facetsList.forEach((facets) => {
      (facets?.[key] ?? []).forEach((entry) => {
        counts.set(entry.value, (counts.get(entry.value) ?? 0) + entry.count);
      });
    });
    merged[key] = Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([value, count]) => ({ value, count }));
  });
  return merged;
}

function mergeSourceBreakdowns(sourceBreakdowns: Array<Record<string, number>>) {
  const merged: Record<string, number> = {};
  sourceBreakdowns.forEach((sourceBreakdown) => {
    Object.entries(sourceBreakdown).forEach(([key, value]) => {
      merged[key] = (merged[key] ?? 0) + value;
    });
  });
  return merged;
}

function parseBounds(url: URL) {
  const sw = parseLatLng(url.searchParams.get('sw'));
  const ne = parseLatLng(url.searchParams.get('ne'));
  if (sw && ne) {
    if (sw.lat > ne.lat || sw.lng > ne.lng) return null;
    return { sw, ne };
  }
  return null;
}

function parseRadius(url: URL) {
  const centerLat = parseNumber(url.searchParams.get('lat'));
  const centerLng = parseNumber(url.searchParams.get('lng'));
  if (centerLat == null || centerLng == null) return undefined;
  const radius = parseNumber(url.searchParams.get('radius')) ?? VENUE_SEARCH_DEFAULT_RADIUS;
  return {
    center: { lat: centerLat, lng: centerLng },
    radiusMeters: radius,
  };
}

function centerFromBounds(bounds: { sw: { lat: number; lng: number }; ne: { lat: number; lng: number } }) {
  return {
    lat: (bounds.sw.lat + bounds.ne.lat) / 2,
    lng: (bounds.sw.lng + bounds.ne.lng) / 2,
  };
}

function parseLatLng(value: string | null) {
  if (!value) return null;
  const [latRaw, lngRaw] = value.split(',').map((token) => parseNumber(token));
  if (latRaw == null || lngRaw == null) return null;
  return { lat: latRaw, lng: lngRaw };
}

function parseNumber(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value: string | null): boolean {
  return value === '1' || value === 'true';
}

function clampLimit(value: number | null, max: number): number {
  if (!value || value <= 0) return 25;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function rateLimitKey(request: Request, label: string) {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown';
  return `${label}:${ip}`;
}
