import { createNearbyActivitiesFetcher } from '../map/api';

describe('createNearbyActivitiesFetcher', () => {
  it('times out stalled requests', async () => {
    jest.useFakeTimers();

    const fetcher = createNearbyActivitiesFetcher({
      buildUrl: () => 'https://example.com/api/nearby',
      fetchImpl: (_input, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason ?? new Error('aborted')),
            { once: true },
          );
        }),
      timeoutMs: 50,
    });

    const promise = fetcher({
      center: { lat: 44.4268, lng: 26.1025 },
      radiusMeters: 1200,
      limit: 20,
    });

    jest.advanceTimersByTime(60);
    await expect(promise).rejects.toThrow('Nearby activities request timed out.');

    jest.useRealTimers();
  });

  it('serializes the shared discovery contract into nearby query params', async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({
      center: { lat: 44.4, lng: 26.1 },
      radiusMeters: 1000,
      count: 0,
      activities: [],
    })));

    const fetcher = createNearbyActivitiesFetcher({
      buildUrl: () => 'https://example.com/api/nearby',
      fetchImpl,
    });

    await fetcher({
      center: { lat: 44.4, lng: 26.1 },
      radiusMeters: 1000,
      filters: {
        searchText: 'Lotus Yoga',
        peopleTraits: ['Curious'],
        taxonomyCategories: ['wellness_yoga'],
        maxDistanceKm: 3,
        trustMode: 'verified_only',
      },
    });

    const requestUrl = String(((fetchImpl.mock.calls[0] as unknown[] | undefined) ?? [])[0] ?? '');
    expect(requestUrl).toContain('q=lotus+yoga');
    expect(requestUrl).toContain('traits=curious');
    expect(requestUrl).toContain('taxonomy=wellness_yoga');
    expect(requestUrl).toContain('distanceKm=3');
    expect(requestUrl).toContain('trust=verified_only');
  });
});
