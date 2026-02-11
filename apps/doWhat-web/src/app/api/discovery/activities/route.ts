import { NextResponse } from 'next/server';

import type { DiscoveryFacets, DiscoveryFilterSupport } from '@/lib/discovery/engine';
import { discoverNearbyActivities } from '@/lib/discovery/engine';
import { normalizePlaceLabel } from '@/lib/places/labels';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_RADIUS_METERS = 2000;
const DEFAULT_LIMIT = 50;

const DEFAULT_FILTER_SUPPORT: DiscoveryFilterSupport = {
  activityTypes: false,
  tags: false,
  traits: false,
  taxonomyCategories: false,
  priceLevels: false,
  capacityKey: false,
  timeWindow: false,
};

const EMPTY_FACETS: DiscoveryFacets = {
  activityTypes: [],
  tags: [],
  traits: [],
  taxonomyCategories: [],
  priceLevels: [],
  capacityKey: [],
  timeWindow: [],
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bounds = parseBounds(url);
  const refresh = parseBoolean(url.searchParams.get('refresh'));

  const center = resolveCenter(url, bounds);
  if (!center) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  const radiusMeters = clampNumber(parseNumber(url.searchParams.get('radius')) ?? DEFAULT_RADIUS_METERS, 100, 100_000);
  const limit = clampNumber(parseNumber(url.searchParams.get('limit')) ?? DEFAULT_LIMIT, 1, 200);

  try {
    const result = await discoverNearbyActivities(
      {
        center,
        radiusMeters,
        limit,
        bounds: bounds ?? undefined,
      },
      { bypassCache: refresh },
    );

    const items = (result.items ?? []).map((item) => ({
      ...item,
      place_label: normalizePlaceLabel(item.place_label, item.venue),
    }));

    return NextResponse.json({
      center: result.center,
      radiusMeters: result.radiusMeters,
      count: result.count ?? items.length,
      items,
      filterSupport: result.filterSupport ?? DEFAULT_FILTER_SUPPORT,
      facets: result.facets ?? EMPTY_FACETS,
      sourceBreakdown: result.sourceBreakdown ?? {},
      cache: result.cache ?? { key: null, hit: false },
      source: result.source ?? null,
      degraded: result.degraded ?? false,
      fallbackError: result.fallbackError ?? null,
      fallbackSource: result.fallbackSource ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
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

function resolveCenter(url: URL, bounds: { sw: { lat: number; lng: number }; ne: { lat: number; lng: number } } | null) {
  const lat = parseNumber(url.searchParams.get('lat'));
  const lng = parseNumber(url.searchParams.get('lng'));
  if (lat != null && lng != null) {
    return { lat, lng };
  }
  if (bounds) {
    return {
      lat: (bounds.sw.lat + bounds.ne.lat) / 2,
      lng: (bounds.sw.lng + bounds.ne.lng) / 2,
    };
  }
  return null;
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}
