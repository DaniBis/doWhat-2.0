import { normalizeDiscoveryFilterContract } from '@dowhat/shared';

import { rankDiscoveryItems } from '@/lib/discovery/ranking';

describe('discovery ranking trust ordering', () => {
  test('orders higher-trust places first when relevance/proximity are comparable', () => {
    const center = { lat: 44.4268, lng: 26.1025 };
    const items = [
      {
        id: 'place:low',
        name: 'Low Trust Venue',
        venue: 'Street A',
        place_id: 'place-low',
        place_label: 'Low Trust Venue',
        lat: 44.427,
        lng: 26.103,
        distance_m: 70,
        activity_types: ['bouldering'],
        tags: ['bouldering'],
        traits: null,
        source_confidence: 0.22,
        verification_state: 'suggested' as const,
        source: 'supabase-places' as const,
      },
      {
        id: 'place:high',
        name: 'High Trust Venue',
        venue: 'Street B',
        place_id: 'place-high',
        place_label: 'High Trust Venue',
        lat: 44.4272,
        lng: 26.1032,
        distance_m: 72,
        activity_types: ['bouldering'],
        tags: ['bouldering'],
        traits: null,
        source_confidence: 0.9,
        verification_state: 'verified' as const,
        source: 'supabase-places' as const,
      },
    ];

    const ranked = rankDiscoveryItems(items, {
      center,
      filters: normalizeDiscoveryFilterContract({
        activityTypes: ['bouldering'],
        tags: [],
        peopleTraits: [],
        taxonomyCategories: [],
        priceLevels: [],
        capacityKey: 'any',
        timeWindow: 'any',
      }),
    });

    expect(ranked[0]?.id).toBe('place:high');
    expect((ranked[0]?.trust_score ?? 0)).toBeGreaterThan(ranked[1]?.trust_score ?? 0);
  });

  test('keeps stable ordering by distance and id when trust score ties', () => {
    const center = { lat: 13.7563, lng: 100.5018 };
    const items = [
      {
        id: 'place:b',
        name: 'Tie Venue B',
        place_id: 'place-b',
        place_label: 'Tie Venue B',
        lat: 13.757,
        lng: 100.502,
        distance_m: 95,
        activity_types: ['climbing'],
        tags: ['climbing'],
        source_confidence: 0.5,
        verification_state: 'needs_votes' as const,
        source: 'supabase-places' as const,
      },
      {
        id: 'place:a',
        name: 'Tie Venue A',
        place_id: 'place-a',
        place_label: 'Tie Venue A',
        lat: 13.757,
        lng: 100.502,
        distance_m: 95,
        activity_types: ['climbing'],
        tags: ['climbing'],
        source_confidence: 0.5,
        verification_state: 'needs_votes' as const,
        source: 'supabase-places' as const,
      },
    ];

    const ranked = rankDiscoveryItems(items, {
      center,
      filters: normalizeDiscoveryFilterContract({
        activityTypes: ['climbing'],
        tags: [],
        peopleTraits: [],
        taxonomyCategories: [],
        priceLevels: [],
        capacityKey: 'any',
        timeWindow: 'any',
      }),
    });

    expect(ranked.map((item) => item.id)).toEqual(['place:a', 'place:b']);
  });

  test('penalizes hospitality-only lookalikes against validated activity hosts', () => {
    const center = { lat: 21.0285, lng: 105.8542 };
    const items = [
      {
        id: 'place:cafe',
        name: 'Chess Cafe',
        place_id: 'place-cafe',
        place_label: 'Chess Cafe',
        lat: 21.0289,
        lng: 105.8546,
        distance_m: 120,
        activity_types: ['chess'],
        tags: ['coffee'],
        source_confidence: 0.45,
        verification_state: 'needs_votes' as const,
        source: 'supabase-places' as const,
        rating: 3.8,
        rating_count: 8,
        popularity_score: 2,
      },
      {
        id: 'place:club',
        name: 'Chess Club',
        place_id: 'place-club',
        place_label: 'Chess Club',
        website: 'https://chessclub.example',
        lat: 21.0295,
        lng: 105.8551,
        distance_m: 180,
        activity_types: ['chess'],
        tags: ['board-game', 'community'],
        source_confidence: 0.82,
        verification_state: 'verified' as const,
        source: 'supabase-places' as const,
        rating: 4.7,
        rating_count: 220,
        popularity_score: 16,
        upcoming_session_count: 4,
      },
    ];

    const ranked = rankDiscoveryItems(items, {
      center,
      filters: normalizeDiscoveryFilterContract({
        activityTypes: ['chess'],
        tags: [],
        peopleTraits: [],
        taxonomyCategories: [],
        priceLevels: [],
        capacityKey: 'any',
        timeWindow: 'any',
      }),
    });

    expect(ranked[0]?.id).toBe('place:club');
    expect((ranked[0]?.rank_score ?? 0)).toBeGreaterThan(ranked[1]?.rank_score ?? 0);
  });
});
