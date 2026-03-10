import { describe, expect, it } from '@jest/globals';
import type { PlaceSummary } from '@dowhat/shared';

import {
  buildHomeDiscoveryFilters,
  buildMobileMapDiscoveryFilters,
  discoveryFiltersEqual,
  rankPlaceSummariesForDiscovery,
} from '../mobileDiscovery';

const makePlace = (overrides: Partial<PlaceSummary> = {}): PlaceSummary => ({
  id: overrides.id ?? 'place-1',
  slug: overrides.slug ?? null,
  name: overrides.name ?? 'VietClimb',
  lat: overrides.lat ?? 21.03,
  lng: overrides.lng ?? 105.85,
  categories: overrides.categories ?? ['climbing'],
  tags: overrides.tags ?? ['bouldering'],
  address: overrides.address ?? 'Hanoi',
  aggregatedFrom: overrides.aggregatedFrom ?? ['nearby-api'],
  attributions: overrides.attributions ?? [],
  metadata: overrides.metadata ?? null,
  transient: overrides.transient ?? true,
  rating: overrides.rating ?? null,
  ratingCount: overrides.ratingCount ?? null,
  popularityScore: overrides.popularityScore ?? null,
});

describe('mobileDiscovery', () => {
  it('maps mobile map filters into discovery query filters', () => {
    expect(
      buildMobileMapDiscoveryFilters({
        searchText: '  Night Climb ',
        categories: ['nightlife', 'art', 'art'],
        maxDistanceKm: 5,
        trustMode: 'verified_only',
      }),
    ).toEqual({
      searchText: 'Night Climb',
      taxonomyCategories: ['art'],
      maxDistanceKm: 5,
      trustMode: 'verified_only',
    });
  });

  it('maps mobile home activity preferences into server-side discovery filters', () => {
    expect(
      buildHomeDiscoveryFilters({
        radius: 15,
        priceRange: [50, 100],
        categories: ['fitness', 'outdoors'],
        timeOfDay: ['Evening (6-9 PM)'],
      }),
    ).toEqual({
      taxonomyCategories: ['fitness', 'outdoors'],
      priceLevels: [2, 3, 4],
      timeWindow: 'evening',
    });
  });

  it('treats normalized discovery filters as equal even when input order differs', () => {
    expect(
      discoveryFiltersEqual(
        {
          searchText: 'Lotus Yoga',
          taxonomyCategories: ['art', 'fitness'],
          priceLevels: [3, 1],
          peopleTraits: ['curious'],
          capacityKey: 'small',
          timeWindow: 'evening',
        },
        {
          searchText: 'lotus yoga',
          taxonomyCategories: ['fitness', 'art'],
          priceLevels: [1, 3],
          peopleTraits: ['Curious'],
          capacityKey: 'small',
          timeWindow: 'evening',
        },
      ),
    ).toBe(true);
  });

  it('keeps mobile place ranking aligned with server rank signals', () => {
    const ranked = rankPlaceSummariesForDiscovery(
      [
        makePlace({
          id: 'fallback-near',
          name: 'Closer Fallback',
          lat: 21.0301,
          lng: 105.8501,
          metadata: { updatedAt: '2026-03-06T10:00:00.000Z' },
        }),
        makePlace({
          id: 'ranked',
          name: 'Better Ranked Place',
          lat: 21.032,
          lng: 105.852,
          rating: 4.8,
          ratingCount: 320,
          popularityScore: 92,
          metadata: {
            rankScore: 0.94,
            qualityConfidence: 0.91,
            placeMatchConfidence: 0.89,
            updatedAt: '2026-03-07T07:00:00.000Z',
          },
        }),
      ],
      {
        center: { lat: 21.03, lng: 105.85 },
        now: new Date('2026-03-07T08:00:00.000Z'),
      },
    );

    expect(ranked.map((place) => place.id)).toEqual(['ranked', 'fallback-near']);
  });

  it('boosts direct search matches when ranking filtered mobile places', () => {
    const ranked = rankPlaceSummariesForDiscovery(
      [
        makePlace({
          id: 'generic',
          name: 'Creative District',
          lat: 21.0302,
          lng: 105.8502,
          metadata: { updatedAt: '2026-03-07T06:00:00.000Z' },
        }),
        makePlace({
          id: 'match',
          name: 'Lotus Yoga Studio',
          lat: 21.031,
          lng: 105.851,
          metadata: { updatedAt: '2026-03-07T06:00:00.000Z' },
        }),
      ],
      {
        center: { lat: 21.03, lng: 105.85 },
        searchText: 'lotus yoga',
        now: new Date('2026-03-07T08:00:00.000Z'),
      },
    );

    expect(ranked[0]?.id).toBe('match');
  });

  it('keeps activity-backed places ahead of hospitality-only lookalikes', () => {
    const ranked = rankPlaceSummariesForDiscovery(
      [
        makePlace({
          id: 'cafe',
          name: 'Chess Cafe',
          categories: ['coffee'],
          tags: ['cafe'],
          rating: 4.8,
          ratingCount: 210,
          popularityScore: 88,
        }),
        makePlace({
          id: 'gym',
          name: 'Peak Climb',
          categories: ['climbing'],
          tags: ['bouldering'],
          rating: 4.6,
          ratingCount: 120,
          popularityScore: 70,
        }),
      ],
      {
        center: { lat: 21.03, lng: 105.85 },
        now: new Date('2026-03-07T08:00:00.000Z'),
      },
    );

    expect(ranked.map((place) => place.id)).toEqual(['gym', 'cafe']);
  });
});
