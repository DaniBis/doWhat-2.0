import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rateLimit';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';
import { searchVenueActivities, isActivityName } from '@/lib/venues/search';
import { VENUE_SEARCH_DEFAULT_RADIUS, VENUE_SEARCH_MAX_LIMIT } from '@/lib/venues/constants';
import type { ActivityName } from '@/lib/venues/constants';

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
  if (!isActivityName(activityParam)) {
    return NextResponse.json({ error: 'Invalid or missing activity parameter.' }, { status: 400 });
  }

  const limit = clampLimit(parseNumber(url.searchParams.get('limit')), VENUE_SEARCH_MAX_LIMIT);
  const bounds = parseBounds(url);
  const radius = bounds ? undefined : parseRadius(url);
  const includeUnverified = parseBoolean(url.searchParams.get('includeUnverified'));

  try {
    const supabase = createClient();
    const { results, debug } = await searchVenueActivities({
      supabase,
      activity: activityParam as ActivityName,
      limit,
      bounds: bounds ?? undefined,
      radius,
      includeUnverified,
    });

    return NextResponse.json({ activity: activityParam, results, debug });
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