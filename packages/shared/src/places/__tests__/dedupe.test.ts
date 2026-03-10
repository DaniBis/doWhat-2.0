import { describe, expect, it } from '@jest/globals';

import type { PlaceSummary } from '../types';
import { dedupePlaceSummaries } from '../dedupe';

const makePlace = (overrides: Partial<PlaceSummary>): PlaceSummary => ({
  id: overrides.id ?? 'place-1',
  slug: overrides.slug ?? null,
  name: overrides.name ?? 'VietClimb',
  lat: overrides.lat ?? 21.0548381,
  lng: overrides.lng ?? 105.8398098,
  categories: overrides.categories ?? ['activity'],
  tags: overrides.tags ?? ['climbing'],
  address: overrides.address ?? null,
  city: overrides.city ?? 'hanoi',
  locality: overrides.locality ?? null,
  region: overrides.region ?? null,
  country: overrides.country ?? null,
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
  metadata: overrides.metadata === undefined ? { placeId: overrides.id ?? 'place-1' } : overrides.metadata,
  transient: overrides.transient ?? true,
});

describe('dedupePlaceSummaries', () => {
  it('dedupes a legacy venue row against the canonical place and preserves the linked venue id', () => {
    const venue = makePlace({
      id: 'db0bd877-08a5-42f9-9dfc-cc3f9a6d864a',
      categories: [],
      tags: [],
      website: null,
      aggregatedFrom: ['supabase-venues'],
      metadata: { venueId: 'db0bd877-08a5-42f9-9dfc-cc3f9a6d864a' },
    });
    const canonical = makePlace({
      id: '3d9e27a6-c62f-4906-a2cf-5d7b406e82fd',
      categories: ['activity', 'fitness'],
      tags: ['climbing', 'sports_centre'],
      aggregatedFrom: ['supabase-places'],
      metadata: { placeId: '3d9e27a6-c62f-4906-a2cf-5d7b406e82fd' },
    });

    const next = dedupePlaceSummaries([venue, canonical]);

    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe('3d9e27a6-c62f-4906-a2cf-5d7b406e82fd');
    expect(next[0]?.aggregatedFrom).toEqual(expect.arrayContaining(['supabase-places', 'supabase-venues']));
    expect(next[0]?.metadata).toMatchObject({
      placeId: '3d9e27a6-c62f-4906-a2cf-5d7b406e82fd',
      linkedVenueId: 'db0bd877-08a5-42f9-9dfc-cc3f9a6d864a',
    });
  });

  it('keeps distinct canonical places even when labels are identical and coordinates are close', () => {
    const first = makePlace({
      id: '11111111-1111-4111-8111-111111111111',
      metadata: { placeId: '11111111-1111-4111-8111-111111111111' },
    });
    const second = makePlace({
      id: '22222222-2222-4222-8222-222222222222',
      lat: 21.0548385,
      lng: 105.8398102,
      metadata: { placeId: '22222222-2222-4222-8222-222222222222' },
    });

    const next = dedupePlaceSummaries([first, second]);

    expect(next).toHaveLength(2);
  });

  it('dedupes a canonical place against an OpenStreetMap fallback row before rendering', () => {
    const canonical = makePlace({
      id: '3d9e27a6-c62f-4906-a2cf-5d7b406e82fd',
      aggregatedFrom: ['supabase-places'],
      metadata: { placeId: '3d9e27a6-c62f-4906-a2cf-5d7b406e82fd' },
    });
    const overpass = makePlace({
      id: 'node:123456',
      lat: 21.054838,
      lng: 105.83981,
      aggregatedFrom: ['openstreetmap'],
      metadata: null,
    });

    const next = dedupePlaceSummaries([canonical, overpass]);

    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe('3d9e27a6-c62f-4906-a2cf-5d7b406e82fd');
  });
});
