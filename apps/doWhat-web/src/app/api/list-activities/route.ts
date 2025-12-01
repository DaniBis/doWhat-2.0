import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rateLimit';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';
import { listActivitiesSummary } from '@/lib/venues/search';
import { VENUE_SEARCH_DEFAULT_RADIUS } from '@/lib/venues/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SUMMARY_RATE_LIMIT = { capacity: 60, intervalMs: 60_000 };

export async function GET(request: Request) {
  const ipKey = rateLimitKey(request, 'list-activities');
  if (!rateLimit(ipKey, SUMMARY_RATE_LIMIT)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const url = new URL(request.url);
  const bounds = parseBounds(url);
  const radius = bounds ? undefined : parseRadius(url);
  const maxVenues = clampNumber(parseNumber(url.searchParams.get('maxVenues')), 50, 1000) ?? undefined;

  if (!bounds && !radius) {
    return NextResponse.json({ error: 'Provide either sw/ne bounds or lat/lng parameters.' }, { status: 400 });
  }

  try {
    const supabase = createClient();
    const summary = await listActivitiesSummary({
      supabase,
      bounds: bounds ?? undefined,
      radius,
      maxVenues,
    });
    return NextResponse.json({ activities: summary });
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
  const lat = parseNumber(url.searchParams.get('lat'));
  const lng = parseNumber(url.searchParams.get('lng'));
  if (lat == null || lng == null) return undefined;
  const radius = parseNumber(url.searchParams.get('radius')) ?? VENUE_SEARCH_DEFAULT_RADIUS;
  return { center: { lat, lng }, radiusMeters: radius };
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

function clampNumber(value: number | null, min: number, max: number): number | null {
  if (value == null) return null;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function rateLimitKey(request: Request, label: string) {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown';
  return `${label}:${ip}`;
}