import { buildHomeCards, normalizeCategoryId } from '../filtering';

const makeRow = (overrides: Partial<Parameters<typeof buildHomeCards>[0]['rows'][number]>) => ({
  id: overrides.id ?? 'session-1',
  host_user_id: overrides.host_user_id ?? 'host-1',
  price_cents: overrides.price_cents ?? 0,
  reliability_score: overrides.reliability_score ?? 75,
  starts_at: overrides.starts_at ?? '2026-03-08T10:00:00.000Z',
  ends_at: overrides.ends_at ?? '2026-03-08T12:00:00.000Z',
  venue_id: overrides.venue_id ?? 'venue-1',
  activities: overrides.activities ?? {
    id: 'activity-1',
    name: 'Chess Session',
    description: 'Friendly chess meetup',
    activity_types: ['community'],
    tags: ['chess'],
  },
  venues: overrides.venues ?? {
    id: 'venue-1',
    name: 'Board Cafe',
    lat: 40.7128,
    lng: -74.006,
  },
});

describe('home filtering pipeline', () => {
  it('applies search + category filters and keeps matching cards', () => {
    const rows = [
      makeRow({
        id: 's-chess',
        activities: {
          id: 'activity-chess',
          name: 'Chess Session',
          description: 'Rapid chess games',
          activity_types: ['community'],
          tags: ['chess'],
        },
      }),
      makeRow({
        id: 's-run',
        activities: {
          id: 'activity-run',
          name: 'Morning Run',
          description: '5k pace group',
          activity_types: ['fitness'],
          tags: ['running'],
        },
      }),
    ];

    const cards = buildHomeCards({
      rows,
      userId: 'host-1',
      searchQuery: 'chess',
      normalizedFilterTypes: [normalizeCategoryId('community') ?? 'community'],
      minReliability: 0,
      hostSelfOnly: false,
      userLat: null,
      userLng: null,
      radiusKm: 25,
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.activity.id).toBe('activity-chess');
  });

  it('applies people filters (host self + reliability) without crashing', () => {
    const rows = [
      makeRow({ id: 'self-good', host_user_id: 'me', reliability_score: 90, activities: { id: 'a1', name: 'Climb', tags: ['climbing'] } }),
      makeRow({ id: 'self-low', host_user_id: 'me', reliability_score: 40, activities: { id: 'a2', name: 'Swim', tags: ['swimming'] } }),
      makeRow({ id: 'other-high', host_user_id: 'other', reliability_score: 95, activities: { id: 'a3', name: 'Yoga', tags: ['yoga'] } }),
    ];

    const cards = buildHomeCards({
      rows,
      userId: 'me',
      searchQuery: '',
      normalizedFilterTypes: [],
      minReliability: 70,
      hostSelfOnly: true,
      userLat: null,
      userLng: null,
      radiusKm: 25,
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.activity.id).toBe('a1');
  });

  it('drops rows without usable coordinates when location scoping is active', () => {
    const rows = [
      makeRow({
        id: 'missing-coords',
        venues: { id: 'venue-1', name: 'No coordinates', lat: null, lng: null },
      }),
    ];

    const cards = buildHomeCards({
      rows,
      userId: 'host-1',
      searchQuery: '',
      normalizedFilterTypes: [],
      minReliability: 0,
      hostSelfOnly: false,
      userLat: 40.7128,
      userLng: -74.006,
      radiusKm: 10,
    });

    expect(cards).toEqual([]);
  });
});
