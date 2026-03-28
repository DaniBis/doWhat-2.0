import { FULL_DISCOVERY_FILTER_SUPPORT, type DiscoveryItem } from '../engine-core';
import { __discoveryEngineTestUtils } from '../engine';

const makeItem = (overrides: Partial<DiscoveryItem>): DiscoveryItem => ({
  id: overrides.id ?? 'item-1',
  name: overrides.name ?? 'Item',
  lat: overrides.lat ?? 21.0285,
  lng: overrides.lng ?? 105.8542,
  venue: overrides.venue ?? null,
  place_id: overrides.place_id ?? null,
  place_label: overrides.place_label ?? overrides.name ?? 'Item',
  activity_types: overrides.activity_types ?? [],
  tags: overrides.tags ?? [],
  traits: overrides.traits ?? null,
  taxonomy_categories: overrides.taxonomy_categories ?? null,
  verification_state: overrides.verification_state ?? 'verified',
  source: overrides.source ?? 'supabase-places',
});

describe('mixed-intent discovery filtering', () => {
  test('preserves strong bucket rules across widened or fallback candidate sets', () => {
    const items: DiscoveryItem[] = [
      makeItem({
        id: 'climb-1',
        name: 'VietClimb Indoor Gym',
        activity_types: ['climbing'],
        tags: ['climbing gym'],
      }),
      makeItem({
        id: 'billiards-1',
        name: 'Hanoi Snooker Hall',
        activity_types: ['billiards'],
        tags: ['pool hall', 'snooker'],
      }),
      makeItem({
        id: 'swim-1',
        name: 'Olympic Swimming Pool',
        activity_types: ['swimming'],
        tags: ['swimming pool'],
      }),
      makeItem({
        id: 'chess-weak',
        name: 'Chess Cafe Corner',
        activity_types: [],
        tags: ['cafe', 'board games'],
        verification_state: 'suggested',
      }),
      makeItem({
        id: 'chess-strong',
        name: 'Hanoi Chess Club',
        activity_types: ['chess'],
        tags: ['chess club'],
      }),
    ];

    const filtered = __discoveryEngineTestUtils.filterByQuery(
      items,
      {
        resultKinds: [],
        searchText: 'billiards chess climb',
        activityTypes: [],
        tags: [],
        peopleTraits: [],
        taxonomyCategories: [],
        priceLevels: [],
        capacityKey: 'any',
        timeWindow: 'any',
        maxDistanceKm: null,
        trustMode: 'all',
        sortMode: 'rank',
      },
      FULL_DISCOVERY_FILTER_SUPPORT,
    );

    const ids = filtered.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(['climb-1', 'billiards-1', 'chess-strong']));
    expect(ids).not.toContain('swim-1');
    expect(ids).not.toContain('chess-weak');
  });
});