import { describe, expect, it } from '@jest/globals';
import type { PlaceSummary } from '@dowhat/shared';

import { rankPlaceSummariesForDiscovery } from '../mobileDiscovery';

const makePlace = (overrides: Partial<PlaceSummary> = {}): PlaceSummary => ({
  id: overrides.id ?? 'place-1',
  slug: overrides.slug ?? null,
  name: overrides.name ?? 'Natural High',
  lat: overrides.lat ?? 44.4321,
  lng: overrides.lng ?? 26.1031,
  categories: overrides.categories ?? ['climbing'],
  tags: overrides.tags ?? ['bouldering'],
  address: overrides.address ?? 'Bucharest',
  aggregatedFrom: overrides.aggregatedFrom ?? ['nearby-api'],
  attributions: overrides.attributions ?? [],
  metadata: overrides.metadata ?? null,
  transient: overrides.transient ?? true,
  rating: overrides.rating ?? null,
  ratingCount: overrides.ratingCount ?? null,
  popularityScore: overrides.popularityScore ?? null,
});

describe('mobile golden discovery scenarios', () => {
  it('Natural High search ranks the correct place first on mobile discovery', () => {
    const ranked = rankPlaceSummariesForDiscovery(
      [
        makePlace({
          id: 'generic-gym',
          name: 'Bucharest Climbing Center',
          lat: 44.4319,
          lng: 26.1029,
          rating: 4.8,
          ratingCount: 420,
          popularityScore: 95,
          metadata: {
            rankScore: 0.93,
            qualityConfidence: 0.9,
            placeMatchConfidence: 0.88,
            updatedAt: '2026-03-08T08:00:00.000Z',
          },
        }),
        makePlace({
          id: 'natural-high',
          name: 'Natural High',
          lat: 44.4321,
          lng: 26.1031,
          rating: 4.5,
          ratingCount: 140,
          popularityScore: 68,
          metadata: {
            rankScore: 0.86,
            qualityConfidence: 0.84,
            placeMatchConfidence: 0.83,
            updatedAt: '2026-03-08T08:00:00.000Z',
          },
        }),
      ],
      {
        center: { lat: 44.4268, lng: 26.1025 },
        searchText: 'natural high',
        now: new Date('2026-03-08T09:00:00.000Z'),
      },
    );

    expect(ranked[0]?.id).toBe('natural-high');
  });
});
