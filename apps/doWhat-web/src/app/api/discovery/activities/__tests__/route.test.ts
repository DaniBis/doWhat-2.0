export {};

jest.mock('@/lib/discovery/engine', () => ({
  discoverNearbyActivities: jest.fn(),
}));

const { discoverNearbyActivities } = jest.requireMock('@/lib/discovery/engine') as {
  discoverNearbyActivities: jest.Mock;
};

let GET: typeof import('../route').GET;

beforeAll(async () => {
  if (!globalThis.TextEncoder || !globalThis.TextDecoder) {
    const { TextEncoder, TextDecoder } = await import('node:util');
    globalThis.TextEncoder = TextEncoder as unknown as typeof globalThis.TextEncoder;
    globalThis.TextDecoder = (globalThis.TextDecoder ?? TextDecoder) as unknown as typeof globalThis.TextDecoder;
  }
  if (!globalThis.ReadableStream) {
    const { ReadableStream } = await import('node:stream/web');
    globalThis.ReadableStream = ReadableStream as unknown as typeof globalThis.ReadableStream;
  }
  if (!globalThis.MessagePort || !globalThis.MessageChannel) {
    const { MessagePort, MessageChannel } = await import('node:worker_threads');
    globalThis.MessagePort = (globalThis.MessagePort ?? MessagePort) as unknown as typeof globalThis.MessagePort;
    globalThis.MessageChannel = (globalThis.MessageChannel ?? MessageChannel) as unknown as typeof globalThis.MessageChannel;
  }
  if (!globalThis.Request || !globalThis.Response || !globalThis.Headers) {
    const { Request, Response, Headers } = await import('undici');
    globalThis.Request = (globalThis.Request ?? Request) as unknown as typeof globalThis.Request;
    globalThis.Response = (globalThis.Response ?? Response) as unknown as typeof globalThis.Response;
    globalThis.Headers = (globalThis.Headers ?? Headers) as unknown as typeof globalThis.Headers;
  }
  const route = await import('../route');
  GET = route.GET;
});

beforeEach(() => {
  discoverNearbyActivities.mockReset();
});

const buildRequest = (search = 'lat=1&lng=2&radius=1500&limit=1') =>
  new Request(`http://localhost/api/discovery/activities?${search}`);

describe('/api/discovery/activities', () => {
  it('includes default metadata when the engine omits facets/support', async () => {
    discoverNearbyActivities.mockResolvedValue({
      center: { lat: 1, lng: 2 },
      radiusMeters: 1500,
      items: [
        {
          id: 'activity-1',
          name: 'Chess in the Park',
          venue: null,
          place_id: null,
          place_label: null,
          lat: 1,
          lng: 2,
          activity_types: [],
          tags: [],
          traits: [],
        },
      ],
    });

    const response = await GET(buildRequest());
    const payload = await response.json();

    expect(discoverNearbyActivities).toHaveBeenCalledWith(
      expect.objectContaining({
        center: { lat: 1, lng: 2 },
        radiusMeters: 1500,
        limit: 1,
      }),
      { bypassCache: false, includeDebug: false, debugMetrics: false },
    );

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.place_label).toBe('Nearby spot');
    expect(payload.filterSupport.capacityKey).toBe(false);
    expect(payload.facets.activityTypes).toEqual([]);
  });

  it('surfaces engine-provided filter support and facets', async () => {
    const facets = {
      activityTypes: [{ value: 'basketball', count: 3 }],
      tags: [{ value: 'indoor', count: 2 }],
      traits: [],
      taxonomyCategories: [],
      priceLevels: [],
      capacityKey: [],
      timeWindow: [],
    };

    const filterSupport = {
      activityTypes: true,
      tags: true,
      traits: false,
      taxonomyCategories: false,
      priceLevels: false,
      capacityKey: false,
      timeWindow: false,
    };

    discoverNearbyActivities.mockResolvedValue({
      center: { lat: 1, lng: 2 },
      radiusMeters: 1500,
      items: [
        {
          id: 'activity-2',
          name: 'Pickup',
          venue: 'Community Court',
          place_id: 'place-1',
          place_label: '',
          lat: 1.01,
          lng: 2.01,
          activity_types: ['basketball'],
          tags: ['indoor'],
          traits: [],
        },
      ],
      filterSupport,
      facets,
      sourceBreakdown: { supabase: 1 },
    });

    const response = await GET(buildRequest('lat=1&lng=2&radius=2000&limit=5'));
    const payload = await response.json();

    expect(discoverNearbyActivities).toHaveBeenCalledWith(
      expect.objectContaining({
        center: { lat: 1, lng: 2 },
        radiusMeters: 2000,
        limit: 5,
      }),
      { bypassCache: false, includeDebug: false, debugMetrics: false },
    );

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.place_label).toBe('Community Court');
    expect(payload.filterSupport).toMatchObject(filterSupport);
    expect(payload.facets.activityTypes).toEqual(facets.activityTypes);
    expect(payload.sourceBreakdown).toEqual({ supabase: 1 });
  });

  it('filters invalid place-backed rows and aligns facets to returned items', async () => {
    discoverNearbyActivities.mockResolvedValue({
      center: { lat: 1, lng: 2 },
      radiusMeters: 1500,
      items: [
        {
          id: 'valid-1',
          name: 'Climbing',
          venue: 'Wall Hub',
          place_id: 'place-1',
          place_label: '',
          lat: 1,
          lng: 2,
          activity_types: ['climbing'],
          tags: ['indoor'],
          traits: ['focused'],
          taxonomy_categories: ['fitness_climbing'],
          price_levels: [2],
          capacity_key: 'small',
          time_window: 'evening',
        },
        {
          id: 'invalid-empty-name',
          name: '   ',
          venue: 'Should drop',
          place_id: 'place-2',
          place_label: 'Should drop',
          lat: 1,
          lng: 2,
          activity_types: ['yoga'],
          tags: ['calm'],
          traits: ['patient'],
          taxonomy_categories: ['wellness_yoga'],
          price_levels: [1],
          capacity_key: 'couple',
          time_window: 'morning',
        },
      ],
      facets: {
        activityTypes: [{ value: 'climbing', count: 1 }, { value: 'yoga', count: 1 }],
        tags: [{ value: 'indoor', count: 1 }, { value: 'calm', count: 1 }],
        traits: [{ value: 'focused', count: 1 }, { value: 'patient', count: 1 }],
        taxonomyCategories: [{ value: 'fitness_climbing', count: 1 }, { value: 'wellness_yoga', count: 1 }],
        priceLevels: [{ value: '2', count: 1 }, { value: '1', count: 1 }],
        capacityKey: [{ value: 'small', count: 1 }, { value: 'couple', count: 1 }],
        timeWindow: [{ value: 'evening', count: 1 }, { value: 'morning', count: 1 }],
      },
    });

    const response = await GET(buildRequest('lat=1&lng=2&radius=1500&limit=5'));
    const payload = await response.json();

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.id).toBe('valid-1');
    expect(payload.items[0]?.place_label).toBe('Wall Hub');
    expect(payload.count).toBe(1);
    expect(payload.facets.activityTypes).toEqual([{ value: 'climbing', count: 1 }]);
    expect(payload.facets.tags).toEqual([{ value: 'indoor', count: 1 }]);
    expect(payload.facets.traits).toEqual([{ value: 'focused', count: 1 }]);
    expect(payload.facets.taxonomyCategories).toEqual([{ value: 'fitness_climbing', count: 1 }]);
  });

  it('derives bounds and enables cache bypass when refresh is requested', async () => {
    discoverNearbyActivities.mockResolvedValue({
      center: { lat: 13.75, lng: 100.55 },
      radiusMeters: 2500,
      items: [],
      cache: { key: 'test', hit: false },
    });

    const response = await GET(
      buildRequest('sw=13.7,100.5&ne=13.8,100.6&refresh=1&lat=13.75&lng=100.55'),
    );
    await response.json();

    expect(discoverNearbyActivities).toHaveBeenCalledWith(
      expect.objectContaining({
        bounds: {
          sw: { lat: 13.7, lng: 100.5 },
          ne: { lat: 13.8, lng: 100.6 },
        },
      }),
      { bypassCache: true, includeDebug: false, debugMetrics: false },
    );
  });

  it('enables debug instrumentation when debug=1 is requested', async () => {
    discoverNearbyActivities.mockResolvedValue({
      center: { lat: 13.75, lng: 100.55 },
      radiusMeters: 2500,
      items: [],
      debug: {
        cacheHit: false,
        candidateCounts: {
          afterRpc: 0,
          afterFallbackMerge: 0,
          afterMetadataFilter: 0,
          afterPlaceGate: 0,
          afterConfidenceGate: 0,
          afterDedupe: 0,
          final: 0,
        },
        dropped: { notPlaceBacked: 0, lowConfidence: 0, genericLabels: 0, deduped: 0 },
        ranking: { enabled: true, placeMinConfidence: 0.8 },
      },
    });

    await GET(buildRequest('lat=13.75&lng=100.55&debug=1'));

    expect(discoverNearbyActivities).toHaveBeenCalledWith(
      expect.objectContaining({
        center: { lat: 13.75, lng: 100.55 },
      }),
      { bypassCache: false, includeDebug: true, debugMetrics: true },
    );
  });
});
