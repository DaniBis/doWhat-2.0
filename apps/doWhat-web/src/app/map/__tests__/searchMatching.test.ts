import type { MapActivity } from '@dowhat/shared';

import { matchesActivitySearch } from '../searchMatching';
import { extractActivitySearchTokens, extractSearchPhrases, extractStructuredActivityTokens } from '../searchTokens';

const makeActivity = (overrides: Partial<MapActivity>): MapActivity => ({
  id: overrides.id ?? 'activity-1',
  name: overrides.name ?? 'Activity',
  venue: overrides.venue ?? null,
  place_id: overrides.place_id ?? null,
  place_label: overrides.place_label ?? null,
  lat: overrides.lat ?? 13.7563,
  lng: overrides.lng ?? 100.5018,
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

const buildInput = (term: string) => ({
  term,
  searchPhrases: extractSearchPhrases(term),
  searchTokens: extractActivitySearchTokens(term),
  structuredSearchTokens: extractStructuredActivityTokens(term),
});

describe('matchesActivitySearch', () => {
  test('excludes unrelated massage result in strict comma-separated multi-activity search', () => {
    const activity = makeActivity({
      name: 'Massage',
      activity_types: ['massage'],
      tags: ['wellness', 'spa', 'pool'],
    });

    const match = matchesActivitySearch(activity, buildInput('climbing, billiards, chess, poker, swimming'));
    expect(match).toBe(false);
  });

  test('matches canonical token in activity types for strict structured search', () => {
    const activity = makeActivity({
      name: 'Urban Playground',
      activity_types: ['climbing'],
      tags: ['fitness'],
    });

    const match = matchesActivitySearch(activity, buildInput('climbing, billiards, chess, poker, swimming'));
    expect(match).toBe(true);
  });

  test('falls back to canonical tag token for strict structured search', () => {
    const activity = makeActivity({
      name: 'Pool Club',
      activity_types: ['social'],
      tags: ['billiards'],
    });

    const match = matchesActivitySearch(activity, buildInput('climbing, billiards, chess'));
    expect(match).toBe(true);
  });

  test('matches taxonomy category token when activity types are sparse', () => {
    const activity = makeActivity({
      name: 'Boulder Spot',
      activity_types: [],
      tags: [],
      taxonomy_categories: ['climbing'],
    });

    const match = matchesActivitySearch(activity, buildInput('climb'));
    expect(match).toBe(true);
  });

  test('keeps non-structured phrase expansion behavior for recall', () => {
    const activity = makeActivity({
      name: 'Bangkok Snooker House',
      activity_types: ['social'],
      tags: ['indoor'],
    });

    const match = matchesActivitySearch(activity, buildInput('billiards climbing'));
    expect(match).toBe(true);
  });
});
