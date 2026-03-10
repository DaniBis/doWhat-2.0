import { describe, expect, it } from '@jest/globals';

import { filterPlaceSummariesByDiscoveryFilters } from '../filtering';
import type { PlaceSummary } from '../types';

const makePlace = (overrides: Partial<PlaceSummary> = {}): PlaceSummary => ({
  id: overrides.id ?? 'place-1',
  slug: overrides.slug ?? null,
  name: overrides.name ?? 'Lotus Yoga Studio',
  lat: overrides.lat ?? 44.4268,
  lng: overrides.lng ?? 26.1025,
  categories: overrides.categories ?? ['yoga'],
  tags: overrides.tags ?? ['wellness_yoga'],
  address: overrides.address ?? 'Bucharest',
  city: overrides.city ?? 'bucharest',
  locality: overrides.locality ?? 'Bucharest',
  region: overrides.region ?? null,
  country: overrides.country ?? 'Romania',
  postcode: overrides.postcode ?? null,
  phone: overrides.phone ?? null,
  website: overrides.website ?? null,
  description: overrides.description ?? null,
  fsqId: overrides.fsqId ?? null,
  rating: overrides.rating ?? null,
  ratingCount: overrides.ratingCount ?? null,
  priceLevel: overrides.priceLevel ?? null,
  popularityScore: overrides.popularityScore ?? null,
  aggregatedFrom: overrides.aggregatedFrom ?? ['supabase-places'],
  primarySource: overrides.primarySource ?? null,
  cacheExpiresAt: overrides.cacheExpiresAt,
  cachedAt: overrides.cachedAt,
  attributions: overrides.attributions ?? [],
  metadata: overrides.metadata ?? null,
  transient: overrides.transient ?? true,
});

describe('place discovery filtering', () => {
  it('removes hospitality-only places even when no explicit filters are active', () => {
    const result = filterPlaceSummariesByDiscoveryFilters(
      [
        makePlace({ id: 'lotus-yoga', categories: ['yoga'], tags: ['wellness_yoga'] }),
        makePlace({ id: 'coffee-stop', name: 'Coffee Stop', categories: ['coffee'], tags: ['cafe'] }),
      ],
      undefined,
      { center: { lat: 44.4268, lng: 26.1025 }, citySlug: 'bucharest' },
    );

    expect(result.map((place) => place.id)).toEqual(['lotus-yoga']);
  });

  it('keeps hospitality venues that have clear activity-host evidence', () => {
    const result = filterPlaceSummariesByDiscoveryFilters(
      [
        makePlace({
          id: 'board-game-cafe',
          name: 'Knights Board Game Cafe',
          categories: ['coffee'],
          tags: ['board-game', 'community'],
        }),
      ],
      undefined,
      { center: { lat: 44.4268, lng: 26.1025 }, citySlug: 'bucharest' },
    );

    expect(result.map((place) => place.id)).toEqual(['board-game-cafe']);
  });

  it('combines text search and taxonomy filters with AND semantics', () => {
    const result = filterPlaceSummariesByDiscoveryFilters(
      [
        makePlace({ id: 'lotus-yoga', name: 'Lotus Yoga Studio', tags: ['wellness_yoga'] }),
        makePlace({ id: 'lotus-cafe', name: 'Lotus Cafe', tags: ['coffee'] }),
      ],
      {
        searchText: 'lotus yoga',
        taxonomyCategories: ['wellness_yoga'],
      },
      { center: { lat: 44.4268, lng: 26.1025 }, citySlug: 'bucharest' },
    );

    expect(result.map((place) => place.id)).toEqual(['lotus-yoga']);
  });

  it('applies max distance deterministically', () => {
    const result = filterPlaceSummariesByDiscoveryFilters(
      [
        makePlace({ id: 'near', lat: 44.4268, lng: 26.1025 }),
        makePlace({ id: 'far', lat: 44.52, lng: 26.21 }),
      ],
      {
        maxDistanceKm: 2,
      },
      { center: { lat: 44.4268, lng: 26.1025 }, citySlug: 'bucharest' },
    );

    expect(result.map((place) => place.id)).toEqual(['near']);
  });

  it('does not revive hospitality-only places through matching search text', () => {
    const result = filterPlaceSummariesByDiscoveryFilters(
      [
        makePlace({ id: 'coffee-stop', name: 'Coffee Stop', categories: ['coffee'], tags: ['cafe'] }),
      ],
      {
        searchText: 'coffee',
      },
      { center: { lat: 44.4268, lng: 26.1025 }, citySlug: 'bucharest' },
    );

    expect(result).toEqual([]);
  });
});
