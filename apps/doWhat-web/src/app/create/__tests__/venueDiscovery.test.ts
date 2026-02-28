import type { MapActivity } from '@dowhat/shared';

import {
  CREATE_VENUE_BASE_RADIUS_METERS,
  CREATE_VENUE_FILTERED_RADIUS_METERS,
  buildVenueDiscoveryQuery,
  mapActivitiesToVenueOptions,
  suggestVenueOptions,
} from '../venueDiscovery';

const makeActivity = (overrides: Partial<MapActivity>): MapActivity => ({
  id: overrides.id ?? 'place:1',
  name: overrides.name ?? 'Nearby spot',
  place_label: overrides.place_label ?? null,
  venue: overrides.venue ?? null,
  place_id: overrides.place_id ?? null,
  lat: overrides.lat ?? 21.02,
  lng: overrides.lng ?? 105.83,
  distance_m: overrides.distance_m ?? null,
  activity_types: overrides.activity_types ?? null,
  tags: overrides.tags ?? null,
  traits: overrides.traits ?? null,
});

describe('venueDiscovery', () => {
  it('uses base radius without activity filters', () => {
    const query = buildVenueDiscoveryQuery({ lat: 21.02, lng: 105.83, activityLabel: '' });
    expect(query.radiusMeters).toBe(CREATE_VENUE_BASE_RADIUS_METERS);
    expect(query.types).toEqual([]);
  });

  it('expands radius when activity filter is present', () => {
    const query = buildVenueDiscoveryQuery({ lat: 21.02, lng: 105.83, activityLabel: 'climb' });
    expect(query.radiusMeters).toBe(CREATE_VENUE_FILTERED_RADIUS_METERS);
    expect(query.types).toContain('climbing');
  });

  it('dedupes venue options by label and keeps nearest first', () => {
    const options = mapActivitiesToVenueOptions([
      makeActivity({ id: 'place:far', place_id: 'far', place_label: 'VietClimb', distance_m: 3000 }),
      makeActivity({ id: 'place:near', place_id: 'near', place_label: 'VietClimb', distance_m: 500 }),
      makeActivity({ id: '6c85f956-69df-43d2-a723-536f1a21823c', place_label: 'Bloc Gym', distance_m: 1200 }),
    ]);

    expect(options).toEqual([
      { id: 'place:near', name: 'VietClimb' },
      { id: '6c85f956-69df-43d2-a723-536f1a21823c', name: 'Bloc Gym' },
    ]);
  });

  it('suggests nearby venues by typed label while keeping manual input optional', () => {
    const options = [
      { id: 'place:vietclimb', name: 'VietClimb' },
      { id: 'place:hanoi', name: 'Hanoi Climbing Hub' },
      { id: 'place:coffee', name: 'Coffee Spot' },
    ];

    const suggestions = suggestVenueOptions(options, 'viet');
    expect(suggestions[0]).toEqual({ id: 'place:vietclimb', name: 'VietClimb' });
    expect(suggestions.map((item) => item.name)).not.toContain('Coffee Spot');
  });

  it('returns empty suggestions for empty typed venue label', () => {
    const suggestions = suggestVenueOptions([{ id: 'a', name: 'VietClimb' }], '   ');
    expect(suggestions).toEqual([]);
  });
});
