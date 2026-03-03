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
});
