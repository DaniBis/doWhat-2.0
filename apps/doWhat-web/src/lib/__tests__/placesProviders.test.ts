import { fetchOverpassPlaces } from '../places/providers/osm';
import { fetchFoursquarePlaces } from '../places/providers/foursquare';
import { fetchGooglePlaces } from '../places/providers/google';
import type { PlacesQuery } from '../places/types';

const originalFetch = globalThis.fetch;

const buildMockResponse = (payload: unknown, status = 200) => {
  const body = JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => body,
  } as unknown as Response;
};

function mockFetchJson(payload: unknown, status = 200) {
  const mock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(
    async () => buildMockResponse(payload, status),
  );
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock as jest.MockedFunction<typeof fetch>;
}

describe('places provider adapters', () => {
  const query: PlacesQuery = {
    bounds: {
      sw: { lat: 13.70, lng: 100.50 },
      ne: { lat: 13.80, lng: 100.60 },
    },
    categories: ['food'],
    limit: 20,
  };

  afterEach(() => {
    jest.resetAllMocks();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete (globalThis as { fetch?: typeof fetch }).fetch;
    }
    delete process.env.FOURSQUARE_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;
  });

  test('fetchOverpassPlaces deduplicates elements', async () => {
    const payload = {
      elements: [
        {
          type: 'node',
          id: 1,
          lat: 13.745,
          lon: 100.535,
          tags: {
            name: 'Dowhat Gym',
            leisure: 'sports_centre',
            'addr:city': 'Bangkok',
          },
        },
        {
          type: 'node',
          id: 1,
          lat: 13.745,
          lon: 100.535,
          tags: {
            name: 'Dowhat Gym',
            leisure: 'sports_centre',
          },
        },
      ],
    };

    const fetchMock = mockFetchJson(payload);

    const places = await fetchOverpassPlaces(query);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(places).toHaveLength(1);
    expect(places[0].name).toBe('Dowhat Gym');
    expect(places[0].categories).toContain('activity');
  });

  test('fetchFoursquarePlaces maps categories', async () => {
    process.env.FOURSQUARE_API_KEY = 'test-key';
    const payload = {
      results: [
        {
          fsq_id: 'abc123',
          name: 'Dowhat Cafe',
          geocodes: { main: { latitude: 13.75, longitude: 100.54 } },
          location: { address: '123 Coffee St', locality: 'Bangkok' },
          categories: [{ id: 13032, name: 'Coffee Shop' }],
        },
      ],
    };

    mockFetchJson(payload);

    const places = await fetchFoursquarePlaces(query);
    expect(places).toHaveLength(1);
    expect(places[0].categories).toContain('coffee');
    expect(places[0].address).toBe('123 Coffee St');
  });

  test('fetchGooglePlaces skips when api key missing', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const places = await fetchGooglePlaces(query);
    expect(places).toEqual([]);
  });

  test('fetchGooglePlaces returns transient results', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    const payload = {
      results: [
        {
          place_id: 'xyz',
          name: 'Dowhat Market',
          geometry: { location: { lat: 13.76, lng: 100.55 } },
          types: ['market'],
          rating: 4.6,
          user_ratings_total: 120,
        },
      ],
    };

    mockFetchJson(payload);

    const places = await fetchGooglePlaces(query);
    expect(places).toHaveLength(1);
    expect(places[0].provider).toBe('google_places');
    expect(places[0].canPersist).toBe(false);
  });

  test('fetchGooglePlaces follows pagination tokens', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    const firstPayload = {
      results: [
        {
          place_id: 'page-1',
          name: 'First Page Gym',
          geometry: { location: { lat: 13.75, lng: 100.55 } },
        },
      ],
      next_page_token: 'token123',
    };
    const secondPayload = {
      results: [
        {
          place_id: 'page-2',
          name: 'Second Page Gym',
          geometry: { location: { lat: 13.76, lng: 100.56 } },
        },
      ],
    };

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(buildMockResponse(firstPayload))
      .mockResolvedValueOnce(buildMockResponse(secondPayload));
    globalThis.fetch = fetchMock as typeof fetch;

    const places = await fetchGooglePlaces({ ...query, categories: undefined });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('pagetoken=token123');
    expect(places.map((place) => place.providerId)).toEqual(['page-1', 'page-2']);
  });

  test('fetchGooglePlaces runs text search fallback for climbing queries', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    const climbingQuery: PlacesQuery = {
      ...query,
      categories: ['climbing_bouldering'],
    };

    const fetchMock = jest.fn((url: string) => {
      if (url.includes('textsearch')) {
        return Promise.resolve(
          buildMockResponse({
            results: [
              {
                place_id: 'text-hit',
                name: 'Natural High',
                geometry: { location: { lat: 44.442, lng: 26.086 } },
              },
            ],
          }),
        );
      }
      return Promise.resolve(buildMockResponse({ results: [] }));
    }) as jest.MockedFunction<typeof fetch>;
    globalThis.fetch = fetchMock;

    const places = await fetchGooglePlaces(climbingQuery);

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('textsearch'), expect.anything());
    expect(places.map((place) => place.providerId)).toContain('text-hit');
    expect(places[0].name).toBe('Natural High');
  });
});
