import { describe, expect, it } from '@jest/globals';

import {
  type DiscoveryFilterContract,
  discoveryFilterContractsEqual,
  normalizeDiscoveryFilterContract,
  parseDiscoveryFilterContractSearchParams,
  serializeDiscoveryFilterContractToSearchParams,
} from '../discovery';

describe('discovery filter contract', () => {
  it('normalizes search, trust, people traits, and ordering deterministically', () => {
    expect(
      normalizeDiscoveryFilterContract({
        searchText: '  Lotus   Yoga  ',
        taxonomyCategories: ['wellness', 'fitness', 'nightlife', 'wellness'],
        peopleTraits: ['Curious', 'kind', 'kind'],
        priceLevels: [3, 1, 3],
        maxDistanceKm: 3.234,
        trustMode: 'verified_only',
        sortMode: 'distance',
      }),
    ).toEqual({
      resultKinds: [],
      searchText: 'lotus yoga',
      activityTypes: [],
      tags: [],
      taxonomyCategories: ['fitness', 'wellness'],
      priceLevels: [1, 3],
      capacityKey: 'any',
      timeWindow: 'any',
      maxDistanceKm: 3.23,
      peopleTraits: ['curious', 'kind'],
      trustMode: 'verified_only',
      sortMode: 'distance',
    });
  });

  it('drops hospitality-first values from structured filter arrays', () => {
    expect(
      normalizeDiscoveryFilterContract({
        activityTypes: ['climbing', 'coffee'],
        tags: ['board-game', 'nightlife'],
        taxonomyCategories: ['specialty-coffee-crawls', 'climbing-bouldering-labs'],
      }),
    ).toMatchObject({
      activityTypes: ['climbing'],
      tags: ['board_game'],
      taxonomyCategories: ['climbing_bouldering_labs'],
    });
  });

  it('parses legacy query flags into the shared trust contract', () => {
    expect(
      parseDiscoveryFilterContractSearchParams(
        new URLSearchParams('q=natural+high&traits=curious,kind&verifiedOnly=1&distanceKm=5'),
      ),
    ).toMatchObject({
      searchText: 'natural high',
      peopleTraits: ['curious', 'kind'],
      trustMode: 'verified_only',
      maxDistanceKm: 5,
    });
  });

  it('serializes and re-parses without semantic drift', () => {
    const original: DiscoveryFilterContract = {
      resultKinds: ['activities', 'places'],
      searchText: 'bouldering gym',
      activityTypes: ['climbing'],
      tags: [],
      taxonomyCategories: ['fitness_climbing'],
      peopleTraits: ['curious'],
      priceLevels: [2],
      maxDistanceKm: 2,
      capacityKey: 'small' as const,
      timeWindow: 'evening' as const,
      trustMode: 'ai_only' as const,
      sortMode: 'name' as const,
    };

    const params = serializeDiscoveryFilterContractToSearchParams(original);
    const reparsed = parseDiscoveryFilterContractSearchParams(params);

    expect(discoveryFilterContractsEqual(original, reparsed)).toBe(true);
  });
});
