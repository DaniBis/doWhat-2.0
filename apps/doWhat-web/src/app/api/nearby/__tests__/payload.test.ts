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
          place_label: 'Unnamed spot',
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
      cache: { key: 'k', hit: false },
      source: 'postgis',
    });

    const result = await GET({ url: 'http://localhost/api/nearby?lat=1&lng=2&radius=2000&limit=5' } as unknown as Request);

    expect(responseJsonMock).toHaveBeenCalledTimes(1);
    void result;
    const payload = responseJsonMock.mock.calls[0]?.[0] as { activities: Array<{ place_label: string }> };
    expect(payload.activities[0]?.place_label).toBe('Unnamed spot');
  });
});
