import { describe, expect, it } from '@jest/globals';

import { placesQueryKey } from '../utils';

describe('placesQueryKey', () => {
  it('normalizes discovery filters so equivalent filter order shares the same cache key', () => {
    const left = placesQueryKey({
      bounds: {
        sw: { lat: 21.02, lng: 105.84 },
        ne: { lat: 21.04, lng: 105.86 },
      },
      city: 'hanoi',
      limit: 200,
      discoveryFilters: {
        searchText: 'Lotus Yoga',
        taxonomyCategories: ['fitness', 'art'],
        priceLevels: [3, 1],
        peopleTraits: ['curious'],
        maxDistanceKm: 3,
        capacityKey: 'small',
        timeWindow: 'evening',
      },
    });

    const right = placesQueryKey({
      bounds: {
        sw: { lat: 21.02, lng: 105.84 },
        ne: { lat: 21.04, lng: 105.86 },
      },
      city: 'hanoi',
      limit: 200,
      discoveryFilters: {
        searchText: 'lotus yoga',
        taxonomyCategories: ['art', 'fitness'],
        priceLevels: [1, 3],
        peopleTraits: ['Curious'],
        maxDistanceKm: 3,
        capacityKey: 'small',
        timeWindow: 'evening',
      },
    });

    expect(left).toEqual(right);
  });

  it('changes the cache key when discovery filters change', () => {
    const base = placesQueryKey({
      bounds: {
        sw: { lat: 21.02, lng: 105.84 },
        ne: { lat: 21.04, lng: 105.86 },
      },
      city: 'hanoi',
      limit: 200,
      discoveryFilters: {
        taxonomyCategories: ['fitness'],
        searchText: 'climbing',
      },
    });

    const filtered = placesQueryKey({
      bounds: {
        sw: { lat: 21.02, lng: 105.84 },
        ne: { lat: 21.04, lng: 105.86 },
      },
      city: 'hanoi',
      limit: 200,
      discoveryFilters: {
        taxonomyCategories: ['fitness'],
        searchText: 'climbing',
        priceLevels: [2],
      },
    });

    expect(base).not.toEqual(filtered);
  });
});
