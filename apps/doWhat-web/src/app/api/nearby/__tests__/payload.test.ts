import { PLACE_FALLBACK_LABEL } from '@/lib/places/labels';

const responseJsonMock = jest.fn((body: unknown, init?: ResponseInit) => ({ body, init }));

const discoverNearbyActivities = jest.fn();

jest.mock('@/lib/discovery/engine', () => ({
  discoverNearbyActivities: (...args: unknown[]) => discoverNearbyActivities(...args),
}));

import { GET } from '../route';

describe('/api/nearby payload', () => {
  type ResponseJson = (body: unknown, init?: ResponseInit) => unknown;
  type GlobalWithResponse = { Response?: { json?: ResponseJson } };
  const globalWithResponse = globalThis as unknown as GlobalWithResponse;
  const originalResponseJson = globalWithResponse.Response?.json;

  beforeAll(() => {
    if (!globalWithResponse.Response) {
      globalWithResponse.Response = { json: responseJsonMock };
      return;
    }
    globalWithResponse.Response.json = responseJsonMock;
  });

  afterAll(() => {
    if (!globalWithResponse.Response) return;
    if (originalResponseJson) {
      globalWithResponse.Response.json = originalResponseJson;
    } else {
      delete globalWithResponse.Response.json;
    }
  });

  beforeEach(() => {
    responseJsonMock.mockClear();
    discoverNearbyActivities.mockReset();
  });

  it('passes discovery payload through with hydrated place labels', async () => {
    discoverNearbyActivities.mockResolvedValue({
      center: { lat: 1, lng: 2 },
      radiusMeters: 2000,
      count: 1,
      items: [
        {
          id: 'activity-1',
          name: 'Chess',
          venue: null,
          place_id: null,
          place_label: PLACE_FALLBACK_LABEL,
          lat: 1,
          lng: 2,
          distance_m: 25,
          activity_types: null,
          tags: null,
          traits: null,
          taxonomy_categories: null,
          price_levels: null,
          capacity_key: null,
          time_window: null,
          upcoming_session_count: 0,
          source: 'postgis',
        },
      ],
      filterSupport: {
        activityTypes: true,
        tags: true,
        traits: true,
        taxonomyCategories: true,
        priceLevels: true,
        capacityKey: true,
        timeWindow: true,
      },
      facets: {
        activityTypes: [],
        tags: [],
        traits: [],
        taxonomyCategories: [],
        priceLevels: [],
        capacityKey: [],
        timeWindow: [],
      },
      sourceBreakdown: { postgis: 1 },
      providerCounts: { openstreetmap: 10, foursquare: 4, google_places: 2 },
      cache: { key: 'k', hit: false },
      source: 'postgis',
    });

    const result = await GET({ url: 'http://localhost/api/nearby?lat=1&lng=2&radius=2000&limit=5' } as unknown as Request);

    expect(responseJsonMock).toHaveBeenCalledTimes(1);
    void result;
    const payload = responseJsonMock.mock.calls[0]?.[0] as {
      activities: Array<{ place_label: string }>;
      providerCounts?: Record<string, number>;
    };
    expect(payload.activities[0]?.place_label).toBe(PLACE_FALLBACK_LABEL);
    expect(payload.providerCounts).toEqual({ openstreetmap: 10, foursquare: 4, google_places: 2 });
  });

  it('enables debug metrics when debug=1 is present', async () => {
    discoverNearbyActivities.mockResolvedValue({
      center: { lat: 1, lng: 2 },
      radiusMeters: 2000,
      count: 0,
      items: [],
      filterSupport: {
        activityTypes: true,
        tags: true,
        traits: true,
        taxonomyCategories: true,
        priceLevels: true,
        capacityKey: true,
        timeWindow: true,
      },
      facets: {
        activityTypes: [],
        tags: [],
        traits: [],
        taxonomyCategories: [],
        priceLevels: [],
        capacityKey: [],
        timeWindow: [],
      },
      sourceBreakdown: {},
      cache: { key: 'k', hit: false },
      source: 'postgis',
      debug: {
        cacheHit: false,
        cacheKey: 'k',
        tilesTouched: ['w21z0g'],
        providerCounts: { openstreetmap: 2, foursquare: 1, google_places: 3 },
        pagesFetched: 4,
        nextPageTokensUsed: 1,
        itemsBeforeDedupe: 12,
        itemsAfterDedupe: 9,
        itemsAfterGates: 7,
        itemsAfterFilters: 6,
        dropReasons: { deduped: 3, lowConfidence: 2 },
        candidateCounts: {
          afterRpc: 1,
          afterFallbackMerge: 1,
          afterMetadataFilter: 1,
          afterPlaceGate: 1,
          afterConfidenceGate: 1,
          afterDedupe: 1,
          final: 1,
        },
        dropped: { notPlaceBacked: 0, lowConfidence: 0, genericLabels: 0, deduped: 0 },
        ranking: { enabled: true, placeMinConfidence: 0.8 },
      },
    });

    await GET({ url: 'http://localhost/api/nearby?lat=1&lng=2&radius=2000&limit=5&debug=1' } as unknown as Request);

    expect(discoverNearbyActivities).toHaveBeenCalledWith(
      expect.objectContaining({
        center: { lat: 1, lng: 2 },
        radiusMeters: 2000,
        limit: 5,
      }),
      expect.objectContaining({
        includeDebug: true,
        debugMetrics: true,
      }),
    );
  });

  it('explain mode returns provider counts and drop reasons', async () => {
    discoverNearbyActivities.mockResolvedValue({
      center: { lat: 13.7563, lng: 100.5018 },
      radiusMeters: 3000,
      count: 1,
      items: [
        {
          id: 'activity-1',
          name: 'Boulder Gym',
          place_id: 'place-1',
          place_label: 'Boulder Gym',
          lat: 13.757,
          lng: 100.502,
        },
      ],
      filterSupport: {
        activityTypes: true,
        tags: true,
        traits: true,
        taxonomyCategories: true,
        priceLevels: true,
        capacityKey: true,
        timeWindow: true,
      },
      facets: {
        activityTypes: [],
        tags: [],
        traits: [],
        taxonomyCategories: [],
        priceLevels: [],
        capacityKey: [],
        timeWindow: [],
      },
      sourceBreakdown: { 'supabase-places': 1 },
      providerCounts: { openstreetmap: 8, foursquare: 2, google_places: 14 },
      cache: { key: 'discovery-cache', hit: false },
      source: 'supabase-places',
      debug: {
        cacheHit: false,
        cacheKey: 'discovery-cache',
        tilesTouched: ['w21z0g', 'w21z0u'],
        providerCounts: { openstreetmap: 8, foursquare: 2, google_places: 14 },
        pagesFetched: 9,
        nextPageTokensUsed: 3,
        itemsBeforeDedupe: 44,
        itemsAfterDedupe: 31,
        itemsAfterGates: 21,
        itemsAfterFilters: 17,
        dropReasons: { deduped: 13, lowConfidence: 4, genericLabels: 2 },
        candidateCounts: {
          afterRpc: 11,
          afterFallbackMerge: 27,
          afterMetadataFilter: 24,
          afterPlaceGate: 22,
          afterConfidenceGate: 21,
          afterDedupe: 17,
          final: 1,
        },
        dropped: { notPlaceBacked: 2, lowConfidence: 1, genericLabels: 2, deduped: 4 },
        ranking: { enabled: true, placeMinConfidence: 0.8 },
      },
    });

    await GET({
      url: 'http://localhost/api/nearby?lat=13.7563&lng=100.5018&radius=3000&limit=20&explain=1',
    } as unknown as Request);

    const payload = responseJsonMock.mock.calls[0]?.[0] as {
      providerCounts: Record<string, number>;
      debug: { dropReasons: Record<string, number>; pagesFetched: number };
    };
    expect(payload.providerCounts).toEqual({ openstreetmap: 8, foursquare: 2, google_places: 14 });
    expect(payload.debug.dropReasons).toMatchObject({ deduped: 13, lowConfidence: 4 });
    expect(payload.debug.pagesFetched).toBe(9);
  });

  it('bypasses cache when refresh=1 is present', async () => {
    discoverNearbyActivities.mockResolvedValue({
      center: { lat: 1, lng: 2 },
      radiusMeters: 2000,
      count: 0,
      items: [],
      filterSupport: {
        activityTypes: true,
        tags: true,
        traits: true,
        taxonomyCategories: true,
        priceLevels: true,
        capacityKey: true,
        timeWindow: true,
      },
      facets: {
        activityTypes: [],
        tags: [],
        traits: [],
        taxonomyCategories: [],
        priceLevels: [],
        capacityKey: [],
        timeWindow: [],
      },
      sourceBreakdown: {},
      cache: { key: 'k', hit: false },
      source: 'postgis',
    });

    await GET({ url: 'http://localhost/api/nearby?lat=1&lng=2&radius=2000&limit=5&refresh=1' } as unknown as Request);

    expect(discoverNearbyActivities).toHaveBeenCalledWith(
      expect.objectContaining({
        center: { lat: 1, lng: 2 },
        radiusMeters: 2000,
        limit: 5,
      }),
      expect.objectContaining({
        bypassCache: true,
      }),
    );
  });

  it('returns at least as many rows on refresh for deterministic provider mocks', async () => {
    discoverNearbyActivities.mockImplementation(
      async (_query: unknown, options: { bypassCache?: boolean }) => ({
        center: { lat: 1, lng: 2 },
        radiusMeters: 2000,
        count: options?.bypassCache ? 2 : 1,
        items: options?.bypassCache
          ? [
              {
                id: 'activity-1',
                name: 'Climbing',
                venue: 'Wall Hub',
                place_id: 'place-1',
                place_label: 'Wall Hub',
                lat: 1,
                lng: 2,
                source: 'postgis',
              },
              {
                id: 'activity-2',
                name: 'Running',
                venue: 'Track',
                place_id: 'place-2',
                place_label: 'Track',
                lat: 1.001,
                lng: 2.001,
                source: 'postgis',
              },
            ]
          : [
              {
                id: 'activity-1',
                name: 'Climbing',
                venue: 'Wall Hub',
                place_id: 'place-1',
                place_label: 'Wall Hub',
                lat: 1,
                lng: 2,
                source: 'postgis',
              },
            ],
        filterSupport: {
          activityTypes: true,
          tags: true,
          traits: true,
          taxonomyCategories: true,
          priceLevels: true,
          capacityKey: true,
          timeWindow: true,
        },
        facets: {
          activityTypes: [],
          tags: [],
          traits: [],
          taxonomyCategories: [],
          priceLevels: [],
          capacityKey: [],
          timeWindow: [],
        },
        sourceBreakdown: { postgis: options?.bypassCache ? 2 : 1 },
        cache: { key: 'k', hit: !options?.bypassCache },
        source: 'postgis',
      }),
    );

    await GET({ url: 'http://localhost/api/nearby?lat=1&lng=2&radius=2000&limit=5' } as unknown as Request);
    const baseline = responseJsonMock.mock.calls[0]?.[0] as { count: number };

    await GET({ url: 'http://localhost/api/nearby?lat=1&lng=2&radius=2000&limit=5&refresh=1' } as unknown as Request);
    const refreshed = responseJsonMock.mock.calls[1]?.[0] as { count: number };

    expect(refreshed.count).toBeGreaterThanOrEqual(baseline.count);
  });

  it('expands radius for sparse filtered results and returns expansion note', async () => {
    discoverNearbyActivities.mockImplementation(
      async (query: { radiusMeters: number }) => ({
        center: { lat: 13.75, lng: 100.55 },
        radiusMeters: query.radiusMeters,
        count: query.radiusMeters < 3000 ? 3 : 22,
        items: [],
        filterSupport: {
          activityTypes: true,
          tags: true,
          traits: true,
          taxonomyCategories: true,
          priceLevels: true,
          capacityKey: true,
          timeWindow: true,
        },
        facets: {
          activityTypes: [],
          tags: [],
          traits: [],
          taxonomyCategories: [],
          priceLevels: [],
          capacityKey: [],
          timeWindow: [],
        },
        sourceBreakdown: {},
        cache: { key: 'k', hit: false },
        source: 'postgis',
      }),
    );

    await GET({
      url: 'http://localhost/api/nearby?lat=13.75&lng=100.55&radius=2000&limit=20&types=climbing',
    } as unknown as Request);

    expect(discoverNearbyActivities).toHaveBeenCalledTimes(2);
    const payload = responseJsonMock.mock.calls[0]?.[0] as {
      radiusExpansion?: { fromRadiusMeters: number; toRadiusMeters: number; expandedCount: number };
      count: number;
    };
    expect(payload.radiusExpansion).toMatchObject({
      fromRadiusMeters: 2000,
      toRadiusMeters: 3200,
      expandedCount: 22,
    });
    expect(payload.count).toBe(22);
  });

  it('keeps expanding filtered radius until threshold is reached', async () => {
    discoverNearbyActivities.mockImplementation(
      async (query: { radiusMeters: number }) => ({
        center: { lat: 21.0285, lng: 105.8542 },
        radiusMeters: query.radiusMeters,
        count: query.radiusMeters < 10000 ? 4 : query.radiusMeters < 20000 ? 11 : 19,
        items: [],
        filterSupport: {
          activityTypes: true,
          tags: true,
          traits: true,
          taxonomyCategories: true,
          priceLevels: true,
          capacityKey: true,
          timeWindow: true,
        },
        facets: {
          activityTypes: [],
          tags: [],
          traits: [],
          taxonomyCategories: [],
          priceLevels: [],
          capacityKey: [],
          timeWindow: [],
        },
        sourceBreakdown: {},
        cache: { key: 'k', hit: false },
        source: 'supabase-places',
      }),
    );

    await GET({
      url: 'http://localhost/api/nearby?lat=21.0285&lng=105.8542&radius=2000&limit=1200&types=climbing',
    } as unknown as Request);

    expect(discoverNearbyActivities).toHaveBeenCalledTimes(7);
    const payload = responseJsonMock.mock.calls[0]?.[0] as {
      radiusExpansion?: { fromRadiusMeters: number; toRadiusMeters: number; expandedCount: number };
      count: number;
    };
    expect(payload.radiusExpansion).toMatchObject({
      fromRadiusMeters: 2000,
      toRadiusMeters: 20000,
      expandedCount: 19,
    });
    expect(payload.count).toBe(19);
  });

  it('expands radius iteratively for sparse unfiltered inventory', async () => {
    discoverNearbyActivities.mockImplementation(
      async (query: { radiusMeters: number }) => ({
        center: { lat: 21.03, lng: 105.84 },
        radiusMeters: query.radiusMeters,
        count: query.radiusMeters < 3200 ? 210 : query.radiusMeters < 5000 ? 340 : 560,
        items: [],
        filterSupport: {
          activityTypes: true,
          tags: true,
          traits: true,
          taxonomyCategories: true,
          priceLevels: true,
          capacityKey: true,
          timeWindow: true,
        },
        facets: {
          activityTypes: [],
          tags: [],
          traits: [],
          taxonomyCategories: [],
          priceLevels: [],
          capacityKey: [],
          timeWindow: [],
        },
        sourceBreakdown: {},
        cache: { key: 'k', hit: false },
        source: 'supabase-places',
      }),
    );

    await GET({
      url: 'http://localhost/api/nearby?lat=21.03&lng=105.84&radius=2000&limit=1200',
    } as unknown as Request);

    expect(discoverNearbyActivities).toHaveBeenCalledTimes(3);
    const payload = responseJsonMock.mock.calls[0]?.[0] as {
      radiusExpansion?: { fromRadiusMeters: number; toRadiusMeters: number; expandedCount: number };
      count: number;
    };
    expect(payload.radiusExpansion).toMatchObject({
      fromRadiusMeters: 2000,
      toRadiusMeters: 5000,
      expandedCount: 560,
    });
    expect(payload.count).toBe(560);
  });
});
