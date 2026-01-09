import { NextResponse } from 'next/server';

import { normalizeEventState } from '@/lib/events/state';
import { hydratePlaceLabel, PLACE_FALLBACK_LABEL } from '@/lib/places/labels';
import { createServiceClient } from '@/lib/supabase/service';
import { hydrateSessions, type HydratedSession } from '@/lib/sessions/server';
import type { EventSummary } from '@dowhat/shared';

import { queryEventsWithFallback } from './queryEventsWithFallback';

const MAX_LIMIT = 200;

const getSessionCoordinates = (session: HydratedSession) => {
  const lat = session.place?.lat ?? session.venue?.lat ?? session.activity?.lat ?? null;
  const lng = session.place?.lng ?? session.venue?.lng ?? session.activity?.lng ?? null;
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
  const placeLabel = hydratePlaceLabel({
    place: session.place,
    venue: session.venue?.name ?? session.activity?.venueLabel ?? null,
    address: session.venue?.address ?? null,
    fallbackLabel: session.activity?.name ?? null,
  });
  const title = session.activity?.name ?? (placeLabel === PLACE_FALLBACK_LABEL ? 'Community session' : placeLabel);
  const placeId = session.placeId ?? session.place?.id ?? session.venueId ?? null;
  const metadata: Record<string, unknown> = {
    source: 'session',
    sessionId: session.id,
    activityId: session.activityId,
    venueId: session.venueId,
  };
  const place = session.place
    ? {
        id: session.place.id,
        name: session.place.name ?? placeLabel,
        lat: session.place.lat,
        lng: session.place.lng,
        address: session.place.address,
        locality: session.place.locality,
        region: session.place.region,
        country: session.place.country,
        categories: session.place.categories,
      }
    : session.venue
      ? {
          id: session.venue.id,
          name: placeLabel,
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
    venue_name: placeLabel,
    place_label: placeLabel,
    lat,
    lng,
    address: session.place?.address ?? session.venue?.address ?? null,
    url: `/sessions/${session.id}`,
    image_url: null,
    status: 'scheduled',
    event_state: 'scheduled',
    tags: ['community'],
    place_id: placeId,
    source_id: null,
    source_uid: session.id,
    reliability_score: session.reliabilityScore,
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

  const execute = async (columns: string[]) => {
    const result = await applyFilters(buildQuery(columns));
    return {
      data: result.data as EventSummary[] | null,
      error: (result.error as { message?: string | null } | null) ?? null,
    };
  };

  const {
    events,
    error,
    omittedEventState,
    omittedReliabilityScore,
    omittedVerificationConfirmations,
    omittedVerificationRequired,
  } = await queryEventsWithFallback(execute);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = events.map((event) => ({
    ...event,
    event_state: normalizeEventState(omittedEventState ? null : event.event_state),
    reliability_score: omittedReliabilityScore ? null : event.reliability_score ?? null,
    verification_confirmations: omittedVerificationConfirmations ? null : event.verification_confirmations ?? null,
    verification_required: omittedVerificationRequired ? null : event.verification_required ?? null,
  }));
  const sessionEvents = await fetchSessionEvents({ client, sw, ne, fromIso, toIso, limit });
  const combined = dedupeEvents([...rows, ...sessionEvents]).sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
  );
  const placeIds = Array.from(
    new Set(
      combined
        .filter((event) => !event.place && typeof event.place_id === 'string' && event.place_id.trim().length > 0)
        .map((event) => event.place_id as string),
    ),
  );

  const placeMap = new Map<
    string,
    {
      id: string;
      name: string | null;
      lat: number | null;
      lng: number | null;
      address: string | null;
      locality: string | null;
      region: string | null;
      country: string | null;
      categories: string[] | null;
    }
  >();

  if (placeIds.length > 0) {
    const { data: places, error: placesError } = await client
      .from('places')
      .select('id,name,lat,lng,address,locality,region,country,categories')
      .in('id', placeIds);

    if (placesError) {
      // eslint-disable-next-line no-console
      console.warn('Failed to hydrate event places, returning base events', placesError.message ?? placesError);
    } else {
      for (const place of places ?? []) {
        if (typeof place.id === 'string') {
          placeMap.set(place.id, place);
        }
      }
    }
  }

  const enriched = combined.map((event) => {
    if (event.place) return event;
    if (!event.place_id) return { ...event, place: null };
    return { ...event, place: placeMap.get(event.place_id) ?? null };
  });

  const normalizedEvents = enriched.map((event) => ({
    ...event,
    place_label: hydratePlaceLabel({
      place: event.place ?? null,
      venue_name: event.venue_name ?? null,
      address: event.address ?? null,
    }),
  }));

  return NextResponse.json({ events: normalizedEvents });
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
