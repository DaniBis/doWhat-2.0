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

const toTrimmed = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const alignFacetsWithItems = (facets: DiscoveryFacets, items: Array<{
  activity_types?: string[] | null;
  tags?: string[] | null;
  traits?: string[] | null;
  taxonomy_categories?: string[] | null;
  price_levels?: Array<number | null> | null;
  capacity_key?: string | null;
  time_window?: string | null;
}>): DiscoveryFacets => {
  const activityTypes = new Set<string>();
  const tags = new Set<string>();
  const traits = new Set<string>();
  const taxonomyCategories = new Set<string>();
  const priceLevels = new Set<string>();
  const capacityKey = new Set<string>();
  const timeWindow = new Set<string>();

  items.forEach((item) => {
    (item.activity_types ?? []).forEach((value) => {
      const cleaned = toTrimmed(value);
      if (cleaned) activityTypes.add(cleaned);
    });
    (item.tags ?? []).forEach((value) => {
      const cleaned = toTrimmed(value);
      if (cleaned) tags.add(cleaned);
    });
    (item.traits ?? []).forEach((value) => {
      const cleaned = toTrimmed(value);
      if (cleaned) traits.add(cleaned);
    });
    (item.taxonomy_categories ?? []).forEach((value) => {
      const cleaned = toTrimmed(value);
      if (cleaned) taxonomyCategories.add(cleaned);
    });
    (item.price_levels ?? []).forEach((value) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        priceLevels.add(String(Math.round(value)));
      }
    });
    const capacity = toTrimmed(item.capacity_key);
    if (capacity) capacityKey.add(capacity);
    const window = toTrimmed(item.time_window);
    if (window) timeWindow.add(window);
  });

  return {
    activityTypes: (facets.activityTypes ?? []).filter((entry) => activityTypes.has(entry.value)),
    tags: (facets.tags ?? []).filter((entry) => tags.has(entry.value)),
    traits: (facets.traits ?? []).filter((entry) => traits.has(entry.value)),
    taxonomyCategories: (facets.taxonomyCategories ?? []).filter((entry) => taxonomyCategories.has(entry.value)),
    priceLevels: (facets.priceLevels ?? []).filter((entry) => priceLevels.has(entry.value)),
    capacityKey: (facets.capacityKey ?? []).filter((entry) => capacityKey.has(entry.value)),
    timeWindow: (facets.timeWindow ?? []).filter((entry) => timeWindow.has(entry.value)),
  };
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bounds = parseBounds(url);
  const refresh = parseBoolean(url.searchParams.get('refresh'));
  const debug = parseBoolean(url.searchParams.get('debug'));
  const explain = parseBoolean(url.searchParams.get('explain'));

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
      { bypassCache: refresh, includeDebug: debug || explain, debugMetrics: debug },
    );

    const items = (result.items ?? [])
      .map((item) => {
        const normalizedName = toTrimmed(item.name);
        const normalizedPlaceLabel = normalizePlaceLabel(item.place_label, item.venue);
        return {
          ...item,
          name: normalizedName ?? '',
          place_label: normalizedPlaceLabel,
        };
      })
      .filter((item) => {
        if (!item.name.trim()) return false;
        if (item.place_id && !item.place_label.trim()) return false;
        return true;
      });

    const alignedFacets = alignFacetsWithItems(result.facets ?? EMPTY_FACETS, items);

    return NextResponse.json({
      center: result.center,
      radiusMeters: result.radiusMeters,
      count: items.length,
      items,
      filterSupport: result.filterSupport ?? DEFAULT_FILTER_SUPPORT,
      facets: alignedFacets,
      sourceBreakdown: result.sourceBreakdown ?? {},
      providerCounts: result.providerCounts ?? {},
      cache: result.cache ?? { key: null, hit: false },
      source: result.source ?? null,
      degraded: result.degraded ?? false,
      fallbackError: result.fallbackError ?? null,
      fallbackSource: result.fallbackSource ?? null,
      debug: debug || explain ? result.debug ?? null : undefined,
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
