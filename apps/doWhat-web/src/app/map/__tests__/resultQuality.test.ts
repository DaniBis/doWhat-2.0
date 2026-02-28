import type { MapActivity } from '@dowhat/shared';

import { dedupeNearDuplicateActivities, pruneLowQualitySearchActivities } from '../resultQuality';

const makeActivity = (overrides: Partial<MapActivity>): MapActivity => ({
  id: overrides.id ?? 'a1',
  name: overrides.name ?? 'Activity',
  place_label: overrides.place_label ?? null,
  place_id: overrides.place_id ?? null,
  venue: overrides.venue ?? null,
  lat: overrides.lat ?? 21.02,
  lng: overrides.lng ?? 105.83,
  distance_m: overrides.distance_m ?? null,
  activity_types: overrides.activity_types ?? null,
  tags: overrides.tags ?? null,
  traits: overrides.traits ?? null,
});

describe('pruneLowQualitySearchActivities', () => {
  it('drops generic tag-only candidates when meaningful results exist', () => {
    const items = [
      makeActivity({ id: 'nearby', name: 'Nearby spot', place_label: 'Nearby spot', activity_types: ['kids'], tags: ['climbing'] }),
      makeActivity({ id: 'viet', name: 'VietClimb', place_label: 'VietClimb', activity_types: ['climbing'], tags: ['climbing'] }),
    ];

    const next = pruneLowQualitySearchActivities({
      activities: items,
      hasSearch: true,
      hasStructuredFilters: false,
      searchTokens: ['climbing'],
      structuredSearchTokens: [],
      selectedTypes: [],
      fallbackLabel: 'Nearby spot',
    });

    expect(next.map((item) => item.id)).toEqual(['viet']);
  });

  it('keeps generic candidates when they are the only available matches', () => {
    const items = [
      makeActivity({ id: 'nearby', name: 'Nearby spot', place_label: 'Nearby spot', activity_types: ['kids'], tags: ['climbing'] }),
    ];

    const next = pruneLowQualitySearchActivities({
      activities: items,
      hasSearch: true,
      hasStructuredFilters: false,
      searchTokens: ['climbing'],
      structuredSearchTokens: [],
      selectedTypes: [],
      fallbackLabel: 'Nearby spot',
    });

    expect(next).toHaveLength(1);
  });

  it('dedupes near-identical venue/place duplicates by label + proximity', () => {
    const items = [
      makeActivity({
        id: 'venue:db0bd877-08a5-42f9-9dfc-cc3f9a6d864a',
        place_id: 'db0bd877-08a5-42f9-9dfc-cc3f9a6d864a',
        name: 'VietClimb',
        place_label: 'VietClimb',
        lat: 21.0548300,
        lng: 105.8398100,
        source: 'supabase-venues',
        activity_types: null,
        tags: null,
      }),
      makeActivity({
        id: 'place:3d9e27a6-c62f-4906-a2cf-5d7b406e82fd',
        place_id: '3d9e27a6-c62f-4906-a2cf-5d7b406e82fd',
        name: 'VietClimb',
        place_label: 'VietClimb',
        lat: 21.0548310,
        lng: 105.8398110,
        source: 'supabase-places',
        activity_types: ['activity', 'fitness', 'climbing'],
        tags: ['climbing'],
      }),
    ];

    const next = dedupeNearDuplicateActivities(items);
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe('place:3d9e27a6-c62f-4906-a2cf-5d7b406e82fd');
  });
});
