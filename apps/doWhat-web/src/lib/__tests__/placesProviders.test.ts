import { fetchOverpassPlaces } from '../places/providers/osm';
import { fetchFoursquarePlaces } from '../places/providers/foursquare';
import { fetchGooglePlaces } from '../places/providers/google';
import type { PlacesQuery } from '../places/types';

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
    delete (global as any).fetch;
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

    (global as any).fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => payload,
      }),
    );

    const places = await fetchOverpassPlaces(query);
    expect(global.fetch).toHaveBeenCalledTimes(1);
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

    (global as any).fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => payload,
      }),
    );

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

    (global as any).fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => payload,
      }),
    );

    const places = await fetchGooglePlaces(query);
    expect(places).toHaveLength(1);
    expect(places[0].provider).toBe('google_places');
    expect(places[0].canPersist).toBe(false);
  });
});
