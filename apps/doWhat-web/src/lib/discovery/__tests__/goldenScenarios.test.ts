import type { MapActivity, PlaceSummary } from '@dowhat/shared';
import { dedupePlaceSummaries } from '@dowhat/shared';

import { matchesActivitySearch } from '@/app/map/searchMatching';
import { extractActivitySearchTokens, extractSearchPhrases, extractStructuredActivityTokens } from '@/app/map/searchTokens';
import { filterPlacesByActivityContract } from '@/lib/discovery/placeActivityFilter';

const makeActivity = (overrides: Partial<MapActivity>): MapActivity => ({
  id: overrides.id ?? 'activity-1',
  name: overrides.name ?? 'Activity',
  venue: overrides.venue ?? null,
  place_id: overrides.place_id ?? null,
  place_label: overrides.place_label ?? null,
  lat: overrides.lat ?? 44.4268,
  lng: overrides.lng ?? 26.1025,
  distance_m: overrides.distance_m ?? null,
  activity_types: overrides.activity_types ?? [],
  tags: overrides.tags ?? [],
  traits: overrides.traits ?? [],
  taxonomy_categories: overrides.taxonomy_categories ?? null,
  price_levels: overrides.price_levels ?? null,
  capacity_key: overrides.capacity_key ?? null,
  time_window: overrides.time_window ?? null,
  upcoming_session_count: overrides.upcoming_session_count ?? 0,
  source: overrides.source ?? 'supabase-places',
  quality_confidence: overrides.quality_confidence ?? null,
  place_match_confidence: overrides.place_match_confidence ?? null,
  rank_score: overrides.rank_score ?? null,
  rank_breakdown: overrides.rank_breakdown ?? null,
  dedupe_key: overrides.dedupe_key ?? null,
});

const buildSearchInput = (term: string) => ({
  term,
  searchPhrases: extractSearchPhrases(term),
  searchTokens: extractActivitySearchTokens(term),
  structuredSearchTokens: extractStructuredActivityTokens(term),
});

const makePlace = (overrides: Partial<PlaceSummary>): PlaceSummary => ({
  id: overrides.id ?? 'place-1',
  slug: overrides.slug ?? null,
  name: overrides.name ?? 'Natural High',
  lat: overrides.lat ?? 44.4268,
  lng: overrides.lng ?? 26.1025,
  categories: overrides.categories ?? ['activity'],
  tags: overrides.tags ?? ['climbing'],
  address: overrides.address ?? null,
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
  metadata: overrides.metadata === undefined ? { placeId: overrides.id ?? 'place-1' } : overrides.metadata,
  transient: overrides.transient ?? true,
});

describe('golden discovery scenarios', () => {
  test('Bouldering in Bucharest viewport returns every known matching place and excludes out-of-bounds noise', () => {
    const bounds = {
      sw: { lat: 44.36, lng: 26.01 },
      ne: { lat: 44.48, lng: 26.18 },
    };
    const places = [
      { id: 'natural-high', lat: 44.4321, lng: 26.1031 },
      { id: 'carol-wall', lat: 44.4102, lng: 26.1162 },
      { id: 'board-game-cafe', lat: 44.415, lng: 26.11 },
      { id: 'far-outside', lat: 44.55, lng: 26.11 },
    ];
    const inferenceByPlaceId = new Map([
      ['natural-high', { activityTypes: ['bouldering', 'climbing'] }],
      ['carol-wall', { activityTypes: ['climbing'] }],
      ['board-game-cafe', { activityTypes: ['board_games'] }],
      ['far-outside', { activityTypes: ['bouldering'] }],
    ]);

    const result = filterPlacesByActivityContract(places, {
      selectedActivityTypes: ['bouldering'],
      inferenceByPlaceId,
      bounds,
    });

    expect(result.map((place) => place.id)).toEqual(['natural-high', 'carol-wall']);
  });

  test('Natural High search finds the correct place on web discovery without pulling in unrelated matches', () => {
    const naturalHigh = makeActivity({
      id: 'natural-high',
      name: 'Natural High Climbing',
      place_id: 'place-natural-high',
      place_label: 'Natural High',
      activity_types: ['climbing'],
      tags: ['bouldering'],
      taxonomy_categories: ['fitness_climbing'],
    });
    const unrelated = makeActivity({
      id: 'lotus-yoga',
      name: 'Lotus Yoga Studio',
      place_id: 'place-lotus-yoga',
      place_label: 'Lotus Yoga Studio',
      activity_types: ['yoga'],
      tags: ['wellness'],
      taxonomy_categories: ['wellness_yoga'],
    });
    const input = buildSearchInput('natural high');

    expect(matchesActivitySearch(naturalHigh, input)).toBe(true);
    expect(matchesActivitySearch(unrelated, input)).toBe(false);
  });

  test('Dedupe collapses provider duplicates but preserves distinct canonical places with the same label', () => {
    const canonical = makePlace({
      id: 'place-natural-high',
      name: 'Natural High',
      lat: 44.4321,
      lng: 26.1031,
      aggregatedFrom: ['supabase-places'],
      metadata: { placeId: 'place-natural-high' },
    });
    const legacyVenue = makePlace({
      id: 'venue-natural-high',
      name: 'Natural High',
      lat: 44.4321002,
      lng: 26.1031001,
      aggregatedFrom: ['supabase-venues'],
      metadata: { venueId: 'venue-natural-high' },
    });
    const distinctPlace = makePlace({
      id: 'place-natural-high-2',
      name: 'Natural High',
      lat: 44.4395,
      lng: 26.145,
      aggregatedFrom: ['supabase-places'],
      metadata: { placeId: 'place-natural-high-2' },
    });

    const result = dedupePlaceSummaries([legacyVenue, canonical, distinctPlace]);

    expect(result.map((place) => place.id)).toEqual(['place-natural-high', 'place-natural-high-2']);
  });
});
