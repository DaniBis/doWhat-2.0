import type { EventSummary } from '@dowhat/shared';

const jsonMock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (...args: unknown[]) => jsonMock(...args),
  },
}));

const fromMock = jest.fn();
const createServiceClientMock = jest.fn(() => ({ from: fromMock }));

jest.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => createServiceClientMock(),
}));

import { GET } from '../route';

type QueryResult = { data: unknown; error: { message?: string | null } | null };

type MockQuery = {
  select: (...args: unknown[]) => MockQuery;
  order: (...args: unknown[]) => MockQuery;
  limit: (...args: unknown[]) => MockQuery;
  or: (...args: unknown[]) => MockQuery;
  gte: (...args: unknown[]) => MockQuery;
  lte: (...args: unknown[]) => MockQuery;
  overlaps: (...args: unknown[]) => MockQuery;
  in: (...args: unknown[]) => MockQuery;
  eq: (...args: unknown[]) => MockQuery;
  maybeSingle: (...args: unknown[]) => Promise<QueryResult>;
  single: (...args: unknown[]) => Promise<QueryResult>;
  then: Promise<QueryResult>['then'];
};

const createQuery = (result: QueryResult): MockQuery => {
  const query = {} as MockQuery;
  query.select = jest.fn(() => query);
  query.order = jest.fn(() => query);
  query.limit = jest.fn(() => query);
  query.or = jest.fn(() => query);
  query.gte = jest.fn(() => query);
  query.lte = jest.fn(() => query);
  query.overlaps = jest.fn(() => query);
  query.in = jest.fn(() => query);
  query.eq = jest.fn(() => query);
  query.maybeSingle = jest.fn(async () => result);
  query.single = jest.fn(async () => result);
  query.then = ((onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected)) as Promise<QueryResult>['then'];
  return query;
};

describe('/api/events payload', () => {
  beforeEach(() => {
    jsonMock.mockClear();
    fromMock.mockReset();
    createServiceClientMock.mockClear();
  });

  it('keeps unlabeled coordinate-backed events explicit instead of fabricating a place label', async () => {
    const eventRow: EventSummary = {
      id: 'event-1',
      title: 'Forest party',
      description: null,
      start_at: new Date().toISOString(),
      end_at: null,
      timezone: null,
      venue_name: null,
      place_label: null,
      lat: 1,
      lng: 2,
      address: null,
      url: null,
      image_url: null,
      status: 'unverified',
      event_state: null,
      tags: null,
      place_id: null,
      source_id: null,
      source_uid: null,
      metadata: {},
      reliability_score: null,
      verification_confirmations: null,
      verification_required: null,
      place: null,
    };

    fromMock.mockImplementation((table: string) => {
      if (table === 'events') return createQuery({ data: [eventRow], error: null });
      if (table === 'sessions') return createQuery({ data: [], error: null });
      if (table === 'places') return createQuery({ data: [], error: null });
      throw new Error(`Unexpected table ${table}`);
    });

    await GET({ url: 'http://localhost/api/events?limit=5' } as unknown as Request);

    expect(jsonMock).toHaveBeenCalledTimes(1);
    const payload = jsonMock.mock.calls[0]?.[0] as { events: EventSummary[] };
    expect(Array.isArray(payload.events)).toBe(true);
    expect(payload.events[0]).toMatchObject({
      id: 'event-1',
      result_kind: 'events',
      discovery_kind: 'open_event',
      discovery_dedupe_key: 'open_event:event-1',
      place_label: null,
      location_kind: 'custom_location',
      is_place_backed: false,
      participation: {
        attendance_supported: false,
        attendance_source_kind: 'none',
        first_party_attendance: false,
        rsvp_supported: false,
        verification_supported: false,
        participation_truth_level: 'unavailable',
        host_kind: 'unknown',
        organizer_kind: 'unknown',
      },
    });
  });

  it('filters out events that do not satisfy verifiedOnly + minAccuracy constraints', async () => {
    const rows: EventSummary[] = [
      {
        id: 'event-low',
        title: 'Low confidence listing',
        description: null,
        start_at: new Date().toISOString(),
        end_at: null,
        timezone: null,
        venue_name: 'Unknown',
        place_label: null,
        lat: 1,
        lng: 2,
        address: null,
        url: null,
        image_url: null,
        status: 'unverified',
        event_state: null,
        tags: null,
        place_id: null,
        source_id: null,
        source_uid: null,
        metadata: {
          locationVerification: {
            confirmed: false,
            accuracyScore: 82,
          },
        },
        reliability_score: null,
        verification_confirmations: null,
        verification_required: null,
        place: null,
      },
      {
        id: 'event-high',
        title: 'High confidence listing',
        description: null,
        start_at: new Date().toISOString(),
        end_at: null,
        timezone: null,
        venue_name: 'Verified Venue',
        place_label: null,
        lat: 3,
        lng: 4,
        address: null,
        url: null,
        image_url: null,
        status: 'verified',
        event_state: null,
        tags: null,
        place_id: null,
        source_id: null,
        source_uid: null,
        metadata: {
          locationVerification: {
            confirmed: true,
            accuracyScore: 97,
          },
        },
        reliability_score: null,
        verification_confirmations: null,
        verification_required: null,
        place: null,
      },
    ];

    fromMock.mockImplementation((table: string) => {
      if (table === 'events') return createQuery({ data: rows, error: null });
      if (table === 'sessions') return createQuery({ data: [], error: null });
      if (table === 'places') return createQuery({ data: [], error: null });
      throw new Error(`Unexpected table ${table}`);
    });

    await GET({ url: 'http://localhost/api/events?limit=20&verifiedOnly=1&minAccuracy=95' } as unknown as Request);

    const payload = jsonMock.mock.calls[0]?.[0] as { events: EventSummary[] };
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0]?.id).toBe('event-high');
  });

  it('applies OR within structured groups and AND between search and structured filters', async () => {
    const rows: EventSummary[] = [
      {
        id: 'event-climb-community',
        title: 'Community Climb Night',
        description: null,
        start_at: new Date().toISOString(),
        end_at: null,
        timezone: null,
        venue_name: 'Wall House',
        place_label: 'Wall House',
        lat: 1,
        lng: 2,
        address: null,
        url: null,
        image_url: null,
        status: 'verified',
        event_state: null,
        tags: ['climbing', 'community'],
        place_id: null,
        source_id: null,
        source_uid: null,
        metadata: {
          locationVerification: { confirmed: true, accuracyScore: 99 },
        },
        reliability_score: null,
        verification_confirmations: null,
        verification_required: null,
        place: null,
      },
      {
        id: 'event-yoga-community',
        title: 'Community Yoga Flow',
        description: null,
        start_at: new Date().toISOString(),
        end_at: null,
        timezone: null,
        venue_name: 'Lotus Studio',
        place_label: 'Lotus Studio',
        lat: 3,
        lng: 4,
        address: null,
        url: null,
        image_url: null,
        status: 'verified',
        event_state: null,
        tags: ['yoga', 'community'],
        place_id: null,
        source_id: null,
        source_uid: null,
        metadata: {
          locationVerification: { confirmed: true, accuracyScore: 98 },
        },
        reliability_score: null,
        verification_confirmations: null,
        verification_required: null,
        place: null,
      },
      {
        id: 'event-climb-private',
        title: 'Private Climb Session',
        description: null,
        start_at: new Date().toISOString(),
        end_at: null,
        timezone: null,
        venue_name: 'Wall House',
        place_label: 'Wall House',
        lat: 5,
        lng: 6,
        address: null,
        url: null,
        image_url: null,
        status: 'verified',
        event_state: null,
        tags: ['climbing'],
        place_id: null,
        source_id: null,
        source_uid: null,
        metadata: {
          locationVerification: { confirmed: true, accuracyScore: 97 },
        },
        reliability_score: null,
        verification_confirmations: null,
        verification_required: null,
        place: null,
      },
    ];

    fromMock.mockImplementation((table: string) => {
      if (table === 'events') return createQuery({ data: rows, error: null });
      if (table === 'sessions') return createQuery({ data: [], error: null });
      if (table === 'places') return createQuery({ data: [], error: null });
      throw new Error(`Unexpected table ${table}`);
    });

    await GET({
      url: 'http://localhost/api/events?limit=20&q=community&types=climbing,yoga&tags=community',
    } as unknown as Request);

    const payload = jsonMock.mock.calls[0]?.[0] as { events: EventSummary[] };
    expect(payload.events.map((event) => event.id)).toEqual(['event-climb-community', 'event-yoga-community']);
  });

  it('supports trust=ai_only while keeping first-party session fallback out of ai-only mode', async () => {
    const rows: EventSummary[] = [
      {
        id: 'event-unverified',
        title: 'Loose listing',
        description: null,
        start_at: new Date().toISOString(),
        end_at: null,
        timezone: null,
        venue_name: 'Unknown',
        place_label: 'Unknown',
        lat: 1,
        lng: 2,
        address: null,
        url: null,
        image_url: null,
        status: 'unverified',
        event_state: null,
        tags: ['community'],
        place_id: null,
        source_id: null,
        source_uid: null,
        metadata: {
          locationVerification: { confirmed: false, accuracyScore: 82 },
        },
        reliability_score: null,
        verification_confirmations: null,
        verification_required: null,
        place: null,
      },
      {
        id: 'event-verified',
        title: 'Verified listing',
        description: null,
        start_at: new Date().toISOString(),
        end_at: null,
        timezone: null,
        venue_name: 'Known',
        place_label: 'Known',
        lat: 3,
        lng: 4,
        address: null,
        url: null,
        image_url: null,
        status: 'verified',
        event_state: null,
        tags: ['community'],
        place_id: null,
        source_id: null,
        source_uid: null,
        metadata: {
          locationVerification: { confirmed: true, accuracyScore: 98 },
        },
        reliability_score: null,
        verification_confirmations: null,
        verification_required: null,
        place: null,
      },
    ];

    const now = Date.now();
    const sessionRow = {
      id: 'session-real',
      activity_id: null,
      venue_id: null,
      place_id: null,
      host_user_id: 'host-1',
      starts_at: new Date(now + 60 * 60 * 1000).toISOString(),
      ends_at: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
      price_cents: 0,
      visibility: 'public',
      max_attendees: 20,
      place_label: 'City Hub',
      reliability_score: null,
      description: null,
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };

    fromMock.mockImplementation((table: string) => {
      if (table === 'events') return createQuery({ data: rows, error: null });
      if (table === 'sessions') return createQuery({ data: [sessionRow], error: null });
      if (table === 'activities') return createQuery({ data: [], error: null });
      if (table === 'venues') return createQuery({ data: [], error: null });
      if (table === 'places') return createQuery({ data: [], error: null });
      if (table === 'profiles') return createQuery({ data: [], error: null });
      throw new Error(`Unexpected table ${table}`);
    });

    await GET({ url: 'http://localhost/api/events?limit=20&trust=ai_only' } as unknown as Request);

    const payload = jsonMock.mock.calls[0]?.[0] as { events: EventSummary[] };
    expect(payload.events.map((event) => event.id)).toEqual(['event-unverified']);
  });

  it('rejects unsupported people filters instead of silently ignoring them', async () => {
    await GET({ url: 'http://localhost/api/events?limit=20&traits=curious' } as unknown as Request);

    expect(jsonMock).toHaveBeenCalledTimes(1);
    expect(jsonMock.mock.calls[0]?.[1]).toMatchObject({ status: 400 });
    expect(jsonMock.mock.calls[0]?.[0]).toMatchObject({
      error: expect.stringContaining('Unsupported /api/events filters: traits'),
    });
  });

  it('returns an empty payload when the shared result kind excludes events', async () => {
    await GET({ url: 'http://localhost/api/events?kind=activities&limit=20' } as unknown as Request);

    expect(jsonMock).toHaveBeenCalledTimes(1);
    expect(jsonMock.mock.calls[0]?.[0]).toEqual({ events: [] });
  });

  it('queries session fallback with default recent lookback when no from filter is provided', async () => {
    const now = Date.now();
    const sessionRow = {
      id: 'session-new',
      activity_id: null,
      venue_id: null,
      place_id: null,
      host_user_id: 'host-1',
      starts_at: new Date(now + 60 * 60 * 1000).toISOString(),
      ends_at: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
      price_cents: 0,
      visibility: 'public',
      max_attendees: 20,
      place_label: 'City Hub',
      reliability_score: null,
      description: null,
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };

    const sessionsQuery = createQuery({ data: [sessionRow], error: null });
    const eventsQuery = createQuery({ data: [], error: null });

    fromMock.mockImplementation((table: string) => {
      if (table === 'events') return eventsQuery;
      if (table === 'sessions') return sessionsQuery;
      if (table === 'activities') return createQuery({ data: [], error: null });
      if (table === 'venues') return createQuery({ data: [], error: null });
      if (table === 'places') return createQuery({ data: [], error: null });
      if (table === 'profiles') return createQuery({ data: [], error: null });
      throw new Error(`Unexpected table ${table}`);
    });

    await GET({ url: 'http://localhost/api/events?limit=20' } as unknown as Request);

    expect(sessionsQuery.or).toHaveBeenCalledWith(expect.stringMatching(/starts_at\.gte\..*ends_at\.gte\..*created_at\.gte\./));
    const payload = jsonMock.mock.calls[0]?.[0] as { events: EventSummary[] };
    expect(payload.events.some((event) => event.id === 'session-new')).toBe(true);
  });

  it('keeps canonical place ids separate from legacy venue ids in session-backed event summaries', async () => {
    const now = Date.now();
    const sessionRow = {
      id: 'session-legacy-venue',
      activity_id: 'activity-1',
      venue_id: 'legacy-venue-1',
      place_id: null,
      host_user_id: 'host-1',
      starts_at: new Date(now + 60 * 60 * 1000).toISOString(),
      ends_at: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
      price_cents: 0,
      visibility: 'public',
      max_attendees: 20,
      place_label: 'Old Hall',
      reliability_score: null,
      description: null,
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };

    fromMock.mockImplementation((table: string) => {
      if (table === 'events') return createQuery({ data: [], error: null });
      if (table === 'sessions') return createQuery({ data: [sessionRow], error: null });
      if (table === 'activities') return createQuery({ data: [{ id: 'activity-1', name: 'Chess Club', description: null, venue: null, lat: null, lng: null }], error: null });
      if (table === 'venues') return createQuery({ data: [{ id: 'legacy-venue-1', name: 'Old Hall', address: '123 Legacy St', lat: 44.43, lng: 26.1 }], error: null });
      if (table === 'places') return createQuery({ data: [], error: null });
      if (table === 'profiles') return createQuery({ data: [], error: null });
      throw new Error(`Unexpected table ${table}`);
    });

    await GET({ url: 'http://localhost/api/events?limit=20' } as unknown as Request);

    const payload = jsonMock.mock.calls[0]?.[0] as { events: EventSummary[] };
    const sessionEvent = payload.events.find((event) => event.id === 'session-legacy-venue');
    expect(sessionEvent).toMatchObject({
      result_kind: 'events',
      origin_kind: 'session',
      location_kind: 'legacy_venue',
      discovery_kind: 'session_mirror',
      discovery_dedupe_key: 'session:session-legacy-venue',
      is_place_backed: false,
      place_id: null,
      venue_name: 'Old Hall',
      participation: {
        attendance_supported: false,
        attendance_source_kind: 'session_attendance',
        first_party_attendance: true,
        rsvp_supported: false,
        verification_supported: true,
        participation_truth_level: 'linked_first_party',
        host_kind: 'session_host',
        organizer_kind: 'dowhat_host',
      },
    });
    expect(sessionEvent?.metadata).toMatchObject({
      venueId: 'legacy-venue-1',
      sessionId: 'session-legacy-venue',
    });
  });

  it('dedupes a mirrored session row against a session-origin event row by linked session id', async () => {
    const now = Date.now();
    const eventRow: EventSummary = {
      id: 'event-imported-session',
      title: 'Imported mirror',
      description: null,
      start_at: new Date(now + 60 * 60 * 1000).toISOString(),
      end_at: null,
      timezone: null,
      venue_name: 'Peak Climb',
      place_label: 'Peak Climb',
      lat: 44.43,
      lng: 26.1,
      address: 'Climbing Street',
      url: 'https://source.example/session-1',
      image_url: null,
      status: 'verified',
      event_state: null,
      tags: ['climbing'],
      place_id: null,
      source_id: 'provider',
      source_uid: 'provider-session-1',
      metadata: {
        source: 'session',
        sessionId: 'session-1',
        sourceUrl: 'https://source.example/session-1',
      },
      reliability_score: null,
      verification_confirmations: null,
      verification_required: null,
      place: null,
    };

    const sessionRow = {
      id: 'session-1',
      activity_id: 'activity-1',
      venue_id: null,
      place_id: 'place-1',
      host_user_id: 'host-1',
      starts_at: new Date(now + 60 * 60 * 1000).toISOString(),
      ends_at: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
      price_cents: 0,
      visibility: 'public',
      max_attendees: 20,
      place_label: 'Peak Climb',
      reliability_score: null,
      description: null,
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };

    fromMock.mockImplementation((table: string) => {
      if (table === 'events') return createQuery({ data: [eventRow], error: null });
      if (table === 'sessions') return createQuery({ data: [sessionRow], error: null });
      if (table === 'activities') return createQuery({ data: [{ id: 'activity-1', name: 'Climbing Night', description: null, venue: null, lat: null, lng: null }], error: null });
      if (table === 'venues') return createQuery({ data: [], error: null });
      if (table === 'places') return createQuery({ data: [{ id: 'place-1', name: 'Peak Climb', lat: 44.43, lng: 26.1, address: 'Climbing Street', locality: null, region: null, country: null, categories: ['climbing'] }], error: null });
      if (table === 'profiles') return createQuery({ data: [], error: null });
      throw new Error(`Unexpected table ${table}`);
    });

    await GET({ url: 'http://localhost/api/events?limit=20' } as unknown as Request);

    const payload = jsonMock.mock.calls[0]?.[0] as { events: EventSummary[] };
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0]).toMatchObject({
      id: 'session-1',
      title: 'Climbing Night',
      result_kind: 'events',
      origin_kind: 'session',
      discovery_kind: 'session_mirror',
      discovery_dedupe_key: 'session:session-1',
      place_id: 'place-1',
      place_label: 'Peak Climb',
    });
  });
});
