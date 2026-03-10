import { NextResponse } from 'next/server';

import { normalizeEventState } from '@/lib/events/state';
import { hydratePlaceLabel, PLACE_FALLBACK_LABEL } from '@/lib/places/labels';
import { createServiceClient } from '@/lib/supabase/service';
import { hydrateSessions, type HydratedSession } from '@/lib/sessions/server';
import {
  annotateEventTruth,
  inferEventLocationKind,
  normalizeDiscoveryFilterContract,
  parseDiscoveryFilterContractSearchParams,
  type EventSummary,
  type NormalizedDiscoveryFilterContract,
} from '@dowhat/shared';

import { queryEventsWithFallback } from './queryEventsWithFallback';

const MAX_LIMIT = 200;
const SESSION_EVENTS_DEFAULT_LOOKBACK_HOURS = 24;
const SESSION_FALLBACK_MIN_FETCH = 500;
const SESSION_FALLBACK_MAX_FETCH = 2000;
const SESSION_FALLBACK_FETCH_MULTIPLIER = 5;
const SUPPORTED_EVENT_FILTER_PARAMS = ['kind', 'q', 'search', 'types', 'tags', 'taxonomy', 'trust', 'verifiedOnly', 'aiOnly', 'ai_only', 'minAccuracy', 'from', 'to', 'sw', 'ne', 'limit', 'categories', 'sort=soonest'] as const;

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
  const placeLabel = session.placeLabel ?? hydratePlaceLabel({
    place: session.place,
    venue: session.venue?.name ?? session.activity?.venueLabel ?? null,
    address: session.venue?.address ?? null,
  });
  const eventPlaceLabel = session.locationKind === 'flexible' ? null : placeLabel;
  const title = session.activity?.name ?? (placeLabel === PLACE_FALLBACK_LABEL ? 'Community session' : placeLabel);
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
    : null;

  return annotateEventTruth({
    id: session.id,
    title,
    description: session.description ?? session.activity?.description ?? null,
    start_at: session.startsAt,
    end_at: session.endsAt,
    timezone: 'UTC',
    venue_name: eventPlaceLabel,
    place_label: eventPlaceLabel,
    lat,
    lng,
    address: session.place?.address ?? session.venue?.address ?? null,
    url: `/sessions/${session.id}`,
    image_url: null,
    status: 'scheduled',
    event_state: 'scheduled',
    tags: ['community'],
    place_id: session.placeId ?? session.place?.id ?? null,
    source_id: null,
    source_uid: session.id,
    reliability_score: session.reliabilityScore,
    metadata,
    place,
    location_kind: session.locationKind,
    is_place_backed: session.isPlaceBacked,
    origin_kind: 'session',
  });
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

type SupportedEventFilters = Pick<
  NormalizedDiscoveryFilterContract,
  'resultKinds' | 'searchText' | 'activityTypes' | 'tags' | 'taxonomyCategories' | 'trustMode'
> & {
  minAccuracy: number | null;
};

type EventFilterCandidate = Pick<
  EventSummary,
  'title' | 'description' | 'venue_name' | 'place_label' | 'address' | 'tags' | 'metadata' | 'status'
> & {
  place?: {
    name?: string | null;
    categories?: string[] | null;
  } | null;
};

const splitCommaValues = (value: string | null): string[] =>
  value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];

const uniqueStrings = (values: string[]): string[] =>
  Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));

const normalizeEventKey = (value: string): string =>
  value.trim().toLowerCase().replace(/[^0-9a-z]+/g, '_').replace(/^_+|_+$/g, '');

// `/api/events` intentionally supports a narrower subset than full discovery.
// Unsupported filter families fail fast here so callers cannot assume false parity.
const parseSupportedEventFilters = (params: URLSearchParams): { filters: SupportedEventFilters; unsupportedParams: string[] } => {
  const shared = parseDiscoveryFilterContractSearchParams(params);
  const legacyCategories = normalizeDiscoveryFilterContract({ tags: splitCommaValues(params.get('categories')) }).tags;
  const merged = normalizeDiscoveryFilterContract({
    resultKinds: shared.resultKinds,
    searchText: shared.searchText,
    activityTypes: shared.activityTypes,
    tags: [...shared.tags, ...legacyCategories],
    taxonomyCategories: shared.taxonomyCategories,
    trustMode: shared.trustMode,
  });

  const minAccuracyParam = Number.parseInt(params.get('minAccuracy') ?? '', 10);
  const minAccuracy = Number.isFinite(minAccuracyParam)
    ? Math.max(0, Math.min(100, minAccuracyParam))
    : null;

  const unsupportedParams = uniqueStrings([
    params.has('traits') && shared.peopleTraits.length ? 'traits' : '',
    params.has('prices') && shared.priceLevels.length ? 'prices' : '',
    params.has('capacity') && shared.capacityKey !== 'any' ? 'capacity' : '',
    params.has('timeWindow') && shared.timeWindow !== 'any' ? 'timeWindow' : '',
    params.has('distanceKm') && shared.maxDistanceKm != null ? 'distanceKm' : '',
    params.has('sort') && (params.get('sort') ?? '').trim().toLowerCase() !== 'soonest' ? 'sort' : '',
  ]);

  return {
    filters: {
      resultKinds: merged.resultKinds,
      searchText: merged.searchText,
      activityTypes: merged.activityTypes,
      tags: merged.tags,
      taxonomyCategories: merged.taxonomyCategories,
      trustMode: merged.trustMode,
      minAccuracy,
    },
    unsupportedParams,
  };
};

const matchesSearchText = (event: EventFilterCandidate, searchText: string): boolean => {
  if (!searchText) return true;
  const haystack = [
    event.title,
    event.description,
    event.venue_name,
    event.place_label,
    event.address,
    event.place?.name,
    ...(event.tags ?? []),
    ...(event.place?.categories ?? []),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();

  if (haystack.includes(searchText)) return true;
  const searchTokens = searchText.split(/[^a-z0-9]+/g).filter(Boolean);
  return searchTokens.length > 0 && searchTokens.every((token) => haystack.includes(token));
};

const buildStructuredEventKeys = (event: EventFilterCandidate): Set<string> => {
  const keys = new Set<string>();
  for (const value of [...(event.tags ?? []), ...(event.place?.categories ?? [])]) {
    const normalized = normalizeEventKey(value);
    if (normalized) keys.add(normalized);
  }
  return keys;
};

const matchesStructuredGroup = (eventKeys: Set<string>, filters: string[]): boolean => {
  if (!filters.length) return true;
  return filters.some((value) => eventKeys.has(normalizeEventKey(value)));
};

const readVerification = (event: { metadata?: Record<string, unknown> | null }): {
  confirmed: boolean;
  accuracyScore: number | null;
} => {
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return { confirmed: false, accuracyScore: null };
  }
  const verification = (metadata as Record<string, unknown>).locationVerification;
  if (!verification || typeof verification !== 'object') {
    return { confirmed: false, accuracyScore: null };
  }
  const record = verification as Record<string, unknown>;
  const confirmed = record.confirmed === true;
  const accuracyScore = typeof record.accuracyScore === 'number' && Number.isFinite(record.accuracyScore)
    ? Math.max(0, Math.min(100, Math.round(record.accuracyScore)))
    : null;
  return { confirmed, accuracyScore };
};

const isSessionOriginEvent = (event: { metadata?: Record<string, unknown> | null }): boolean => {
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== 'object') return false;
  const source = (metadata as Record<string, unknown>).source;
  return source === 'session';
};

const isVerifiedEvent = (event: EventFilterCandidate): boolean => {
  if (isSessionOriginEvent(event)) return true;
  if (event.status === 'verified') return true;
  return readVerification(event).confirmed;
};

const matchesTrustMode = (event: EventFilterCandidate, filters: SupportedEventFilters): boolean => {
  if (isSessionOriginEvent(event)) {
    return filters.trustMode !== 'ai_only';
  }
  // Events do not expose a stable suggestion-state column across all environments,
  // so `ai_only` currently means "unconfirmed non-session rows" on this endpoint.
  if (filters.trustMode === 'verified_only') return isVerifiedEvent(event);
  if (filters.trustMode === 'ai_only') return !isVerifiedEvent(event);
  return true;
};

const matchesAccuracy = (event: EventFilterCandidate, minAccuracy: number | null): boolean => {
  if (minAccuracy == null) return true;
  if (isSessionOriginEvent(event)) return true;
  const verification = readVerification(event);
  return verification.accuracyScore != null && verification.accuracyScore >= minAccuracy;
};

const matchesSupportedEventFilters = (event: EventFilterCandidate, filters: SupportedEventFilters): boolean => {
  if (!matchesSearchText(event, filters.searchText)) return false;

  const eventKeys = buildStructuredEventKeys(event);
  if (!matchesStructuredGroup(eventKeys, filters.activityTypes)) return false;
  if (!matchesStructuredGroup(eventKeys, filters.tags)) return false;
  if (!matchesStructuredGroup(eventKeys, filters.taxonomyCategories)) return false;
  if (!matchesTrustMode(event, filters)) return false;
  if (!matchesAccuracy(event, filters.minAccuracy)) return false;
  return true;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sw = parseCoordinatePair(url.searchParams.get('sw'));
  const ne = parseCoordinatePair(url.searchParams.get('ne'));
  const fromIso = parseIso(url.searchParams.get('from'));
  const toIso = parseIso(url.searchParams.get('to'));
  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : 100;
  const { filters, unsupportedParams } = parseSupportedEventFilters(url.searchParams);
  const structuredPrefilterTags = uniqueStrings([
    ...filters.activityTypes,
    ...filters.tags,
    ...filters.taxonomyCategories,
  ]);

  if (unsupportedParams.length > 0) {
    return NextResponse.json(
      {
        error: `Unsupported /api/events filters: ${unsupportedParams.join(', ')}. Supported filters are ${SUPPORTED_EVENT_FILTER_PARAMS.join(', ')}.`,
      },
      { status: 400 },
    );
  }

  if (filters.resultKinds.length > 0 && !filters.resultKinds.includes('events')) {
    return NextResponse.json({ events: [] });
  }

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
    if (structuredPrefilterTags.length) {
      next = next.overlaps('tags', structuredPrefilterTags);
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

  const normalizedEvents = enriched.map((event) => {
    const hydratedPlaceLabel = hydratePlaceLabel({
      place: event.place ?? null,
      venue_name: event.venue_name ?? null,
      address: event.address ?? null,
      fallbackLabel: event.place_label ?? null,
    });
    const placeLabel =
      inferEventLocationKind(event) === 'flexible' && hydratedPlaceLabel === PLACE_FALLBACK_LABEL
        ? null
        : hydratedPlaceLabel;

    return annotateEventTruth({
      ...event,
      place_label: placeLabel,
    });
  });

  const filteredEvents = normalizedEvents.filter((event) => matchesSupportedEventFilters(event, filters));

  return NextResponse.json({ events: filteredEvents });
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
  const effectiveFromIso =
    fromIso
    ?? new Date(Date.now() - SESSION_EVENTS_DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const sessionFetchLimit = Math.min(
    SESSION_FALLBACK_MAX_FETCH,
    Math.max(SESSION_FALLBACK_MIN_FETCH, limit * SESSION_FALLBACK_FETCH_MULTIPLIER),
  );

  let query = client
    .from('sessions')
    .select('*')
    .order('starts_at', { ascending: true })
    .limit(sessionFetchLimit);
  query = query.or(`starts_at.gte.${effectiveFromIso},ends_at.gte.${effectiveFromIso},created_at.gte.${effectiveFromIso}`);
  if (toIso) query = query.lte('starts_at', toIso);
  const { data, error } = await query;
  if (error || !data?.length) return [];

  const hydrated = await hydrateSessions(client, data);
  return hydrated
    .map((session) => ({ session, coords: getSessionCoordinates(session) }))
    .filter(({ coords }) => isWithinBounds(coords, sw, ne))
    .map(({ session }) => sessionToEventSummary(session));
}
