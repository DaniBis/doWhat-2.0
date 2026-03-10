import { describe, expect, it, jest } from '@jest/globals';

import { createEventsFetcher } from '../events/api';
import { eventsQueryKey, normalizeEventsQuery } from '../events/utils';

describe('events query contract', () => {
  it('normalizes the supported discovery subset and preserves legacy aliases deterministically', () => {
    expect(
      normalizeEventsQuery({
        resultKinds: ['events', 'places'],
        searchText: '  Lotus   Flow ',
        activityTypes: ['Climbing', 'coffee'],
        tags: ['community', 'nightlife'],
        taxonomyCategories: ['wellness_yoga', 'specialty-coffee-crawls'],
        trustMode: 'verified_only',
        verifiedOnly: true,
        categories: ['board-game'],
        minAccuracy: 92.9,
      }),
    ).toEqual({
      sw: null,
      ne: null,
      from: null,
      to: null,
      limit: null,
      filters: {
        resultKinds: ['events', 'places'],
        searchText: 'lotus flow',
        activityTypes: ['climbing'],
        tags: ['board_game', 'community'],
        taxonomyCategories: ['wellness_yoga'],
        trustMode: 'verified_only',
      },
      minAccuracy: 93,
    });
  });

  it('builds a stable query key from the normalized subset', () => {
    expect(
      eventsQueryKey({
        resultKinds: ['events'],
        searchText: 'Night Climb',
        tags: ['community'],
        verifiedOnly: true,
        minAccuracy: 95.4,
      }),
    ).toEqual([
      'events',
      {
        sw: null,
        ne: null,
        from: null,
        to: null,
        resultKinds: ['events'],
        searchText: 'night climb',
        activityTypes: [],
        tags: ['community'],
        taxonomyCategories: [],
        limit: null,
        trustMode: 'verified_only',
        minAccuracy: 95,
      },
    ]);
  });

  it('serializes supported discovery filters plus legacy aliases for the events endpoint', async () => {
    const fetchMock = jest.fn(
      async (): Promise<Response> =>
        ({
          ok: true,
          json: async () => ({ events: [] }),
        }) as unknown as Response,
    );
    const fetchImpl = fetchMock as unknown as typeof fetch;

    const fetchEvents = createEventsFetcher({
      buildUrl: () => 'http://localhost/api/events',
      fetchImpl,
    });

    await fetchEvents({
      sw: { lat: 44.4, lng: 26.1 },
      ne: { lat: 44.5, lng: 26.2 },
      resultKinds: ['events'],
      searchText: 'community climb',
      activityTypes: ['climbing'],
      tags: ['community'],
      taxonomyCategories: ['wellness_yoga'],
      trustMode: 'verified_only',
      minAccuracy: 94,
      categories: ['legacy-board-game'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = (fetchMock.mock.calls[0] as unknown[] | undefined)?.[0];
    expect(url).toBeDefined();
    const requestUrl = new URL(String(url));
    expect(requestUrl.searchParams.get('kind')).toBe('events');
    expect(requestUrl.searchParams.get('q')).toBe('community climb');
    expect(requestUrl.searchParams.get('types')).toBe('climbing');
    expect(requestUrl.searchParams.get('tags')).toBe('community,legacy_board_game');
    expect(requestUrl.searchParams.get('taxonomy')).toBe('wellness_yoga');
    expect(requestUrl.searchParams.get('trust')).toBe('verified_only');
    expect(requestUrl.searchParams.get('minAccuracy')).toBe('94');
    expect(requestUrl.searchParams.get('categories')).toBeNull();
    expect(requestUrl.searchParams.get('sw')).toBe('44.4,26.1');
    expect(requestUrl.searchParams.get('ne')).toBe('44.5,26.2');
  });
});
