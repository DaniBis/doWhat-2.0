const fetchPlacesForViewport = jest.fn<Promise<unknown>, [unknown]>();
const recordPlacesMetrics = jest.fn<Promise<void>, [unknown]>(() => Promise.resolve());

jest.mock('@/lib/places/aggregator', () => ({
  fetchPlacesForViewport: (query: unknown) => fetchPlacesForViewport(query),
}));

jest.mock('@/lib/places/metrics', () => ({
  recordPlacesMetrics: (payload: unknown) => recordPlacesMetrics(payload),
}));

import { GET } from '../route';

describe('/api/places route', () => {
  type ResponseJson = (body: unknown, init?: ResponseInit) => unknown;
  type GlobalWithResponse = { Response?: { json?: ResponseJson } };
  const responseJsonMock = jest.fn((body: unknown, init?: ResponseInit) => ({ body, init }));
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
    fetchPlacesForViewport.mockReset();
    recordPlacesMetrics.mockClear();
    responseJsonMock.mockClear();
  });

  it('applies the shared discovery filter contract to place responses', async () => {
    fetchPlacesForViewport.mockResolvedValue({
      cacheHit: false,
      places: [
        {
          id: 'lotus-yoga',
          slug: null,
          name: 'Lotus Yoga Studio',
          lat: 44.4268,
          lng: 26.1025,
          categories: ['yoga'],
          tags: ['wellness_yoga'],
          address: 'Bucharest',
          city: 'bucharest',
          locality: 'Bucharest',
          region: null,
          country: 'Romania',
          postcode: null,
          phone: null,
          website: null,
          description: null,
          fsqId: null,
          rating: null,
          ratingCount: null,
          priceLevel: 2,
          popularityScore: null,
          aggregatedFrom: ['supabase-places'],
          primarySource: null,
          cacheExpiresAt: undefined,
          cachedAt: undefined,
          attributions: [],
          metadata: null,
          transient: true,
        },
        {
          id: 'coffee-stop',
          slug: null,
          name: 'Coffee Stop',
          lat: 44.49,
          lng: 26.18,
          categories: ['coffee'],
          tags: ['cafe'],
          address: 'Bucharest',
          city: 'bucharest',
          locality: 'Bucharest',
          region: null,
          country: 'Romania',
          postcode: null,
          phone: null,
          website: null,
          description: null,
          fsqId: null,
          rating: null,
          ratingCount: null,
          priceLevel: 2,
          popularityScore: null,
          aggregatedFrom: ['supabase-places'],
          primarySource: null,
          cacheExpiresAt: undefined,
          cachedAt: undefined,
          attributions: [],
          metadata: null,
          transient: true,
        },
      ],
      providerCounts: { openstreetmap: 0, foursquare: 0, google_places: 0 },
      explain: null,
    });

    await GET({
      url: 'http://localhost/api/places?sw=44.40,26.08&ne=44.45,26.12&taxonomy=wellness_yoga&q=lotus&distanceKm=2',
    } as unknown as Request);
    const payload = responseJsonMock.mock.calls[0]?.[0] as { places: Array<{ id: string }> };

    expect(fetchPlacesForViewport).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: ['wellness_yoga'],
        discoveryFilters: expect.objectContaining({
          searchText: 'lotus',
          taxonomyCategories: ['wellness_yoga'],
          maxDistanceKm: 2,
        }),
      }),
    );
    expect(payload.places).toHaveLength(1);
    expect(payload.places[0]?.id).toBe('lotus-yoga');
  });
});
