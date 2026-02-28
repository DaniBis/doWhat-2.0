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

const runSearchPipeline = (activities: MapActivity[], term: string): MapActivity[] => {
  const normalizedTerm = term.trim().toLowerCase();
  const input = {
    term: normalizedTerm,
    searchPhrases: extractSearchPhrases(normalizedTerm),
    searchTokens: extractActivitySearchTokens(normalizedTerm),
    structuredSearchTokens: extractStructuredActivityTokens(normalizedTerm),
  };

  return activities.filter((activity) => matchesActivitySearch(activity, input));
};

describe('map search pipeline integration', () => {
  test('comma-separated multi-intent search keeps OR semantics and excludes unrelated massage result', () => {
    const activities: MapActivity[] = [
      makeActivity({
        id: 'climbing-1',
        name: 'Urban Playground',
        activity_types: ['climbing'],
        tags: ['fitness'],
      }),
      makeActivity({
        id: 'billiards-1',
        name: 'Pool Hub',
        activity_types: ['social'],
        tags: ['billiards', 'indoor'],
      }),
      makeActivity({
        id: 'massage-1',
        name: 'Massage Crew',
        activity_types: ['massage'],
        tags: ['wellness', 'spa', 'pool'],
      }),
    ];

    const result = runSearchPipeline(activities, 'climbing, billiards, chess, poker, swimming');
    const ids = result.map((item) => item.id);

    expect(ids).toEqual(expect.arrayContaining(['climbing-1', 'billiards-1']));
    expect(ids).not.toContain('massage-1');
  });

  test('comma-separated search keeps tag fallback for sparse activity_types', () => {
    const activities: MapActivity[] = [
      makeActivity({
        id: 'chess-tag-only',
        name: 'Quiet Cafe',
        activity_types: [],
        tags: ['chess'],
      }),
      makeActivity({
        id: 'running-only',
        name: 'Run Club',
        activity_types: ['running'],
        tags: ['outdoor'],
      }),
    ];

    const result = runSearchPipeline(activities, 'chess, climbing');
    const ids = result.map((item) => item.id);

    expect(ids).toContain('chess-tag-only');
    expect(ids).not.toContain('running-only');
  });
});
