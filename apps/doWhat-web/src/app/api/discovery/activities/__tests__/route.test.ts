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
        filters: expect.objectContaining({ searchText: '' }),
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
        filters: expect.objectContaining({ searchText: '' }),
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
        filters: expect.objectContaining({ searchText: '' }),
      }),
      { bypassCache: true, includeDebug: false, debugMetrics: false },
    );
  });

  it('forwards parsed discovery filters from query params', async () => {
    discoverNearbyActivities.mockResolvedValue({
      center: { lat: 21.0285, lng: 105.8542 },
      radiusMeters: 3000,
      items: [],
    });

    await GET(buildRequest('lat=21.0285&lng=105.8542&radius=3000&limit=10&q=bouldering&types=climbing&tags=indoor'));

    expect(discoverNearbyActivities).toHaveBeenCalledWith(
      expect.objectContaining({
        center: { lat: 21.0285, lng: 105.8542 },
        radiusMeters: 3000,
        limit: 10,
        filters: expect.objectContaining({
          searchText: 'bouldering',
          activityTypes: ['climbing'],
          tags: ['indoor'],
        }),
      }),
      { bypassCache: false, includeDebug: false, debugMetrics: false },
    );
  });

  it('enables debug instrumentation when debug=1 is requested', async () => {
    discoverNearbyActivities.mockResolvedValue({
      center: { lat: 13.75, lng: 100.55 },
      radiusMeters: 2500,
      items: [],
      debug: {
        cacheHit: false,
        cacheKey: 'debug-key',
        tilesTouched: ['w21z0g'],
        providerCounts: { openstreetmap: 2, foursquare: 1, google_places: 3 },
        pagesFetched: 3,
        nextPageTokensUsed: 1,
        itemsBeforeDedupe: 15,
        itemsAfterDedupe: 11,
        itemsAfterGates: 9,
        itemsAfterFilters: 8,
        dropReasons: { deduped: 4, lowConfidence: 2 },
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

  it('returns explain telemetry fields when explain=1 is requested', async () => {
    discoverNearbyActivities.mockResolvedValue({
      center: { lat: 13.75, lng: 100.55 },
      radiusMeters: 2500,
      items: [],
      providerCounts: { openstreetmap: 4, foursquare: 1, google_places: 7 },
      debug: {
        cacheHit: false,
        cacheKey: 'explain-cache',
        tilesTouched: ['w21z0g', 'w21z0u'],
        providerCounts: { openstreetmap: 4, foursquare: 1, google_places: 7 },
        pagesFetched: 5,
        nextPageTokensUsed: 2,
        itemsBeforeDedupe: 27,
        itemsAfterDedupe: 20,
        itemsAfterGates: 15,
        itemsAfterFilters: 11,
        dropReasons: { deduped: 7, lowConfidence: 3 },
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

    const response = await GET(buildRequest('lat=13.75&lng=100.55&explain=1'));
    const payload = await response.json();

    expect(payload.providerCounts).toEqual({ openstreetmap: 4, foursquare: 1, google_places: 7 });
    expect(payload.debug.dropReasons).toMatchObject({ deduped: 7, lowConfidence: 3 });
    expect(payload.debug.pagesFetched).toBe(5);
    expect(payload.debug.nextPageTokensUsed).toBe(2);
  });

  it('mocked provider outputs across Hanoi, Bangkok, and Da Nang preserve category diversity', async () => {
    discoverNearbyActivities.mockImplementation(async (query) => {
      const center = query.center;
      if (center.lat > 20) {
        return {
          center,
          radiusMeters: 3000,
          items: [
            {
              id: 'hn-climb',
              name: 'Hanoi Climb',
              place_id: 'p-hn-1',
              place_label: 'Hanoi Climb',
              lat: 21.03,
              lng: 105.85,
              activity_types: ['climbing', 'bouldering'],
              tags: ['climbing'],
            },
            {
              id: 'hn-run',
              name: 'West Lake Run',
              place_id: 'p-hn-2',
              place_label: 'West Lake Run',
              lat: 21.05,
              lng: 105.83,
              activity_types: ['running'],
              tags: ['running'],
            },
          ],
          facets: {
            activityTypes: [
              { value: 'climbing', count: 1 },
              { value: 'running', count: 1 },
            ],
            tags: [],
            traits: [],
            taxonomyCategories: [],
            priceLevels: [],
            capacityKey: [],
            timeWindow: [],
          },
          filterSupport: {
            activityTypes: true,
            tags: true,
            traits: true,
            taxonomyCategories: true,
            priceLevels: true,
            capacityKey: true,
            timeWindow: true,
          },
        };
      }
      if (center.lng > 108) {
        return {
          center,
          radiusMeters: 3000,
          items: [
            {
              id: 'dn-yoga',
              name: 'Da Nang Yoga',
              place_id: 'p-dn-1',
              place_label: 'Da Nang Yoga',
              lat: 16.06,
              lng: 108.22,
              activity_types: ['yoga'],
              tags: ['yoga'],
            },
            {
              id: 'dn-run',
              name: 'My Khe Run',
              place_id: 'p-dn-2',
              place_label: 'My Khe Run',
              lat: 16.05,
              lng: 108.24,
              activity_types: ['running'],
              tags: ['running'],
            },
          ],
          facets: {
            activityTypes: [
              { value: 'yoga', count: 1 },
              { value: 'running', count: 1 },
            ],
            tags: [],
            traits: [],
            taxonomyCategories: [],
            priceLevels: [],
            capacityKey: [],
            timeWindow: [],
          },
          filterSupport: {
            activityTypes: true,
            tags: true,
            traits: true,
            taxonomyCategories: true,
            priceLevels: true,
            capacityKey: true,
            timeWindow: true,
          },
        };
      }
      return {
        center,
        radiusMeters: 3000,
        items: [
          {
            id: 'bk-chess',
            name: 'Bangkok Chess Cafe',
            place_id: 'p-bk-1',
            place_label: 'Bangkok Chess Cafe',
            lat: 13.76,
            lng: 100.5,
            activity_types: ['chess'],
            tags: ['chess'],
          },
          {
            id: 'bk-padel',
            name: 'Padel Club Bangkok',
            place_id: 'p-bk-2',
            place_label: 'Padel Club Bangkok',
            lat: 13.75,
            lng: 100.57,
            activity_types: ['padel'],
            tags: ['padel'],
          },
        ],
        facets: {
          activityTypes: [
            { value: 'chess', count: 1 },
            { value: 'padel', count: 1 },
          ],
          tags: [],
          traits: [],
          taxonomyCategories: [],
          priceLevels: [],
          capacityKey: [],
          timeWindow: [],
        },
        filterSupport: {
          activityTypes: true,
          tags: true,
          traits: true,
          taxonomyCategories: true,
          priceLevels: true,
          capacityKey: true,
          timeWindow: true,
        },
      };
    });

    const hanoiRes = await GET(buildRequest('lat=21.0285&lng=105.8542&radius=3000&limit=20'));
    const hanoiPayload = await hanoiRes.json();

    const bangkokRes = await GET(buildRequest('lat=13.7563&lng=100.5018&radius=3000&limit=20'));
    const bangkokPayload = await bangkokRes.json();

    const danangRes = await GET(buildRequest('lat=16.0544&lng=108.2022&radius=3000&limit=20'));
    const danangPayload = await danangRes.json();

    expect(hanoiPayload.facets.activityTypes.length).toBeGreaterThan(1);
    expect(bangkokPayload.facets.activityTypes.length).toBeGreaterThan(1);
    expect(danangPayload.facets.activityTypes.length).toBeGreaterThan(1);
  });
});
