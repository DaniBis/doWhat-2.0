import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/service';
import { hydrateSessions, type HydratedSession } from '@/lib/sessions/server';
import type { EventSummary } from '@dowhat/shared';

const MAX_LIMIT = 200;
const EVENT_COLUMNS = [
  'id',
  'title',
  'description',
  'start_at',
  'end_at',
  'timezone',
  'venue_name',
  'lat',
  'lng',
  'address',
  'url',
  'image_url',
  'status',
  'tags',
  'place_id',
  'source_id',
  'source_uid',
  'metadata'
];
const EVENT_COLUMNS_FALLBACK = EVENT_COLUMNS.map((column) =>
  column === 'title' ? 'title:normalized_title' : column
);

const missingColumn = (message: string | null | undefined, column: string) => {
  if (typeof message !== 'string') return false;
  const lower = message.toLowerCase();
  return lower.includes('column') && lower.includes(column.toLowerCase());
};

const getSessionCoordinates = (session: HydratedSession) => {
  const lat = session.venue?.lat ?? session.activity?.lat ?? null;
  const lng = session.venue?.lng ?? session.activity?.lng ?? null;
  return { lat, lng };
};

const isWithinBounds = (
  coords: { lat: number | null; lng: number | null },
  sw?: { lat: number; lng: number } | null,
  ne?: { lat: number; lng: number } | null,
) => {
  if (!sw || !ne) return true;
  if (coords.lat == null || coords.lng == null) return false;
  return coords.lat >= sw.lat && coords.lat <= ne.lat && coords.lng >= sw.lng && coords.lng <= ne.lng;
};

const sessionToEventSummary = (session: HydratedSession): EventSummary => {
  const { lat, lng } = getSessionCoordinates(session);
  const title = session.activity?.name ?? session.venue?.name ?? 'Community session';
  const venueName = session.venue?.name ?? session.activity?.venueLabel ?? null;
  const placeName = session.venue?.name ?? session.activity?.venueLabel ?? session.activity?.name ?? title;
  const metadata: Record<string, unknown> = {
    source: 'session',
    sessionId: session.id,
    activityId: session.activityId,
    venueId: session.venueId,
  };
  const place = session.venue
    ? {
        id: session.venue.id,
        name: placeName,
        lat: session.venue.lat,
        lng: session.venue.lng,
        address: session.venue.address,
        locality: null,
        region: null,
        country: null,
        categories: null,
      }
    : null;

  return {
    id: session.id,
    title,
    description: session.description ?? session.activity?.description ?? null,
    start_at: session.startsAt,
    end_at: session.endsAt,
    timezone: 'UTC',
    venue_name: venueName,
    lat,
    lng,
    address: session.venue?.address ?? null,
    url: `/sessions/${session.id}`,
    image_url: null,
    status: 'scheduled',
    tags: ['community'],
    place_id: session.venueId ?? null,
    source_id: null,
    source_uid: session.id,
    metadata,
    place,
  };
};

const dedupeEvents = (events: EventSummary[]): EventSummary[] => {
  const seen = new Set<string>();
  const result: EventSummary[] = [];
  for (const event of events) {
    const key = (typeof event.metadata === 'object' && event.metadata && 'sessionId' in event.metadata)
      ? String((event.metadata as Record<string, unknown>).sessionId)
      : event.id;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(event);
  }
  return result;
};

const parseCoordinatePair = (value: string | null): { lat: number; lng: number } | null => {
  if (!value) return null;
  const [latRaw, lngRaw] = value.split(',').map((part) => Number.parseFloat(part.trim()));
  if (!Number.isFinite(latRaw) || !Number.isFinite(lngRaw)) return null;
  return { lat: latRaw, lng: lngRaw };
};

const parseIso = (value: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sw = parseCoordinatePair(url.searchParams.get('sw'));
  const ne = parseCoordinatePair(url.searchParams.get('ne'));
  const fromIso = parseIso(url.searchParams.get('from'));
  const toIso = parseIso(url.searchParams.get('to'));
  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : 100;
  const categoriesParam = url.searchParams.get('categories');
  const categories = categoriesParam
    ? categoriesParam
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0)
    : [];

  const client = createServiceClient();
  const buildQuery = (columns: string[]) =>
    client
      .from('events')
      .select(columns.join(','))
      .order('start_at', { ascending: true })
      .limit(limit);

  const applyFilters = (query: ReturnType<typeof buildQuery>) => {
    let next = query;
    if (fromIso) {
      next = next.gte('start_at', fromIso);
    }
    if (toIso) {
      next = next.lte('start_at', toIso);
    }
    if (sw && ne) {
      next = next.gte('lat', sw.lat).lte('lat', ne.lat).gte('lng', sw.lng).lte('lng', ne.lng);
    }
    if (categories.length) {
      next = next.overlaps('tags', categories);
    }
    return next;
  };

  const execute = async (columns: string[]) => applyFilters(buildQuery(columns));

  let { data: events, error } = await execute(EVENT_COLUMNS);
  let attemptedFallback = false;
  if (error && missingColumn(error.message, 'title')) {
    attemptedFallback = true;
    ({ data: events, error } = await execute(EVENT_COLUMNS_FALLBACK));
  }

  if (error) {
    if (attemptedFallback && missingColumn(error.message, 'normalized_title')) {
      console.warn('[events-api] missing both title and normalized_title columns, returning empty dataset');
      events = [];
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const rows = (events ?? []) as unknown as EventSummary[];
  const sessionEvents = await fetchSessionEvents({ client, sw, ne, fromIso, toIso, limit });
  const combined = dedupeEvents([...rows, ...sessionEvents]).sort((a, b) =>
    new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );
  const placeIds = Array.from(new Set(rows.map((row) => row.place_id).filter((id): id is string => Boolean(id))));
  let placeMap = new Map<string, {
    id: string;
    name: string | null;
    lat: number | null;
    lng: number | null;
    address: string | null;
    locality: string | null;
    region: string | null;
    country: string | null;
    categories: string[] | null;
  }>();

  if (placeIds.length) {
    const { data: places, error: placeError } = await client
      .from('places')
      .select('id,name,lat,lng,address,locality,region,country,categories')
      .in('id', placeIds);
    if (placeError) {
      return NextResponse.json({ error: placeError.message }, { status: 500 });
    }
    placeMap = new Map((places ?? []).map((place) => [place.id, place] as const));
  }

  const enriched = combined.map((event) => ({
    ...event,
    place: event.place ? event.place : event.place_id ? placeMap.get(event.place_id) ?? null : null,
  }));

  return NextResponse.json({ events: enriched });
}

async function fetchSessionEvents({
  client,
  sw,
  ne,
  fromIso,
  toIso,
  limit,
}: {
  client: ReturnType<typeof createServiceClient>;
  sw: { lat: number; lng: number } | null;
  ne: { lat: number; lng: number } | null;
  fromIso: string | null;
  toIso: string | null;
  limit: number;
}): Promise<EventSummary[]> {
  let query = client
    .from('sessions')
    .select('*')
    .order('starts_at', { ascending: true })
    .limit(limit);
  if (fromIso) query = query.gte('starts_at', fromIso);
  if (toIso) query = query.lte('starts_at', toIso);
  const { data, error } = await query;
  if (error || !data?.length) return [];

  const hydrated = await hydrateSessions(client, data);
  return hydrated
    .map((session) => ({ session, coords: getSessionCoordinates(session) }))
    .filter(({ coords }) => isWithinBounds(coords, sw, ne))
    .map(({ session }) => sessionToEventSummary(session));
}
