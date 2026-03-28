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
        tags: ['climbing', 'fitness'],
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
        name: 'Quiet Clubhouse',
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

  test('bouldering search rejects broad sports-centre noise without strong evidence', () => {
    const activities: MapActivity[] = [
      makeActivity({
        id: 'vietclimb',
        name: 'VietClimb',
        activity_types: ['bouldering', 'climbing'],
        tags: ['climbing', 'sports_centre'],
        verification_state: 'verified',
      } as Partial<MapActivity>),
      makeActivity({
        id: 'sports-centre-noise',
        name: 'Trung tâm Thể thao Ba Đình',
        activity_types: ['running', 'badminton', 'basketball', 'climbing', 'padel'],
        tags: ['sports_centre'],
        verification_state: 'suggested',
      } as Partial<MapActivity>),
    ];

    const ids = runSearchPipeline(activities, 'bouldering').map((item) => item.id);

    expect(ids).toEqual(['vietclimb']);
  });

  test('martial arts search does not match crafts within community-centre rows', () => {
    const activities: MapActivity[] = [
      makeActivity({
        id: 'community-noise',
        name: 'Hanoi Creative City',
        activity_types: ['crafts', 'drawing', 'dancing'],
        tags: ['community_centre'],
        verification_state: 'suggested',
      } as Partial<MapActivity>),
    ];

    expect(runSearchPipeline(activities, 'martial arts')).toEqual([]);
  });

  test('mixed billiards chess climb search excludes swimming rows while keeping strong intent buckets', () => {
    const activities: MapActivity[] = [
      makeActivity({
        id: 'climb-1',
        name: 'VietClimb Indoor Gym',
        activity_types: ['climbing'],
        tags: ['climbing gym'],
        verification_state: 'verified',
      } as Partial<MapActivity>),
      makeActivity({
        id: 'billiards-1',
        name: 'Hanoi Snooker Hall',
        activity_types: ['billiards'],
        tags: ['pool hall', 'snooker'],
        verification_state: 'verified',
      } as Partial<MapActivity>),
      makeActivity({
        id: 'swim-1',
        name: 'Olympic Swimming Pool',
        activity_types: ['swimming'],
        tags: ['swimming pool'],
        verification_state: 'verified',
      } as Partial<MapActivity>),
      makeActivity({
        id: 'chess-weak',
        name: 'Chess Cafe Corner',
        activity_types: [],
        tags: ['cafe', 'board games'],
        verification_state: 'suggested',
      } as Partial<MapActivity>),
      makeActivity({
        id: 'chess-strong',
        name: 'Hanoi Chess Club',
        activity_types: ['chess'],
        tags: ['chess club'],
        verification_state: 'verified',
      } as Partial<MapActivity>),
    ];

    const ids = runSearchPipeline(activities, 'billiards chess climb').map((item) => item.id);

    expect(ids).toEqual(expect.arrayContaining(['climb-1', 'billiards-1', 'chess-strong']));
    expect(ids).not.toContain('swim-1');
    expect(ids).not.toContain('chess-weak');
  });

  test('billiards-specific search does not match swimming pools', () => {
    const activities: MapActivity[] = [
      makeActivity({
        id: 'billiards-1',
        name: 'Pool Club Hanoi',
        activity_types: ['billiards'],
        tags: ['pool hall'],
        verification_state: 'verified',
      } as Partial<MapActivity>),
      makeActivity({
        id: 'swim-1',
        name: 'West Lake Swimming Pool',
        activity_types: ['swimming'],
        tags: ['swimming pool'],
        verification_state: 'verified',
      } as Partial<MapActivity>),
    ];

    const ids = runSearchPipeline(activities, 'billiards').map((item) => item.id);

    expect(ids).toContain('billiards-1');
    expect(ids).not.toContain('swim-1');
  });
});
