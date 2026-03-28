import { __activityMatchingTestUtils } from '@/lib/places/activityMatching';

describe('activity matching inference', () => {
  test('produces multiple activity matches when venue input supports diversity', () => {
    const result = __activityMatchingTestUtils.computeMatchesForPlace({
      place: {
        id: 'place-1',
        name: 'Peak Bouldering and Yoga Studio',
        description: 'Indoor bouldering walls with daily yoga classes',
        categories: ['fitness'],
        tags: ['bouldering', 'climbing', 'yoga'],
        metadata: null,
        city: 'Bangkok',
        locality: 'Bangkok',
        foursquare_id: null,
        updated_at: new Date().toISOString(),
        venue_activities: [],
      },
      catalog: [
        {
          id: 2001,
          slug: 'bouldering',
          name: 'Bouldering',
          description: null,
          keywords: ['bouldering', 'climbing gym'],
          fsq_categories: [],
        },
        {
          id: 2002,
          slug: 'yoga',
          name: 'Yoga',
          description: null,
          keywords: ['yoga', 'yoga studio'],
          fsq_categories: [],
        },
        {
          id: 2003,
          slug: 'chess',
          name: 'Chess',
          description: null,
          keywords: ['chess', 'chess club'],
          fsq_categories: [],
        },
      ],
      fsqCategories: new Set<string>(),
      manualOverrides: [],
      activityEvidenceIds: new Set<number>(),
      nowIso: new Date().toISOString(),
    } as Parameters<typeof __activityMatchingTestUtils.computeMatchesForPlace>[0]);

    const matchedIds = Array.from(result.matches.keys()).sort((a, b) => a - b);
    expect(matchedIds).toEqual([2001, 2002]);
    expect(result.upserts.map((row) => row.activity_id).sort((a, b) => a - b)).toEqual([2001, 2002]);
  });

  test('matches multilingual keyword variants for padel and bouldering', () => {
    const result = __activityMatchingTestUtils.computeMatchesForPlace({
      place: {
        id: 'place-2',
        name: 'Sân Padel Leo Nui',
        description: 'โบลเดอร์ และ sân padel trong nhà',
        categories: ['fitness'],
        tags: ['padel', 'leo nui', 'โบลเดอร์'],
        metadata: null,
        city: 'Da Nang',
        locality: 'Da Nang',
        foursquare_id: null,
        updated_at: new Date().toISOString(),
        venue_activities: [],
      },
      catalog: [
        {
          id: 3001,
          slug: 'padel',
          name: 'Padel',
          description: null,
          keywords: ['padel', 'sân padel', 'สนามพาเดล'],
          fsq_categories: [],
        },
        {
          id: 3002,
          slug: 'bouldering',
          name: 'Bouldering',
          description: null,
          keywords: ['bouldering', 'leo nui', 'โบลเดอร์'],
          fsq_categories: [],
        },
      ],
      fsqCategories: new Set<string>(),
      manualOverrides: [],
      activityEvidenceIds: new Set<number>(),
      nowIso: new Date().toISOString(),
    } as Parameters<typeof __activityMatchingTestUtils.computeMatchesForPlace>[0]);

    expect(Array.from(result.matches.keys()).sort((a, b) => a - b)).toEqual([3001, 3002]);
  });

  test('does not create keyword-only activity matches for hospitality-first places', () => {
    const result = __activityMatchingTestUtils.computeMatchesForPlace({
      place: {
        id: 'place-3',
        name: 'Chess Cafe',
        description: 'Specialty coffee and pastries',
        categories: ['coffee'],
        tags: ['cafe'],
        metadata: null,
        city: 'Hanoi',
        locality: 'Hanoi',
        foursquare_id: null,
        updated_at: new Date().toISOString(),
        venue_activities: [],
      },
      catalog: [
        {
          id: 4001,
          slug: 'chess',
          name: 'Chess',
          description: null,
          keywords: ['chess', 'chess club'],
          fsq_categories: [],
        },
      ],
      fsqCategories: new Set<string>(),
      manualOverrides: [],
      activityEvidenceIds: new Set<number>(),
      nowIso: new Date().toISOString(),
    } as Parameters<typeof __activityMatchingTestUtils.computeMatchesForPlace>[0]);

    expect(Array.from(result.matches.keys())).toEqual([]);
    expect(result.upserts).toEqual([]);
  });

  test('keeps activity-specific keyword matches for hospitality places when real session evidence exists', () => {
    const result = __activityMatchingTestUtils.computeMatchesForPlace({
      place: {
        id: 'place-4',
        name: 'Chess Cafe',
        description: 'Coffee bar with weekly club nights',
        categories: ['coffee'],
        tags: ['cafe'],
        metadata: null,
        city: 'Hanoi',
        locality: 'Hanoi',
        foursquare_id: null,
        updated_at: new Date().toISOString(),
        venue_activities: [],
      },
      catalog: [
        {
          id: 4001,
          slug: 'chess',
          name: 'Chess',
          description: null,
          keywords: ['chess', 'chess club'],
          fsq_categories: [],
        },
      ],
      fsqCategories: new Set<string>(),
      manualOverrides: [],
      activityEvidenceIds: new Set<number>([4001]),
      nowIso: new Date().toISOString(),
    } as Parameters<typeof __activityMatchingTestUtils.computeMatchesForPlace>[0]);

    expect(Array.from(result.matches.keys())).toEqual([4001]);
    expect(result.eventEvidenceProtectedMatches).toBe(1);
  });

  test('deletes stale hospitality keyword mappings when no activity evidence remains', () => {
    const result = __activityMatchingTestUtils.computeMatchesForPlace({
      place: {
        id: 'place-5',
        name: 'Chess Cafe',
        description: 'Specialty coffee and pastries',
        categories: ['coffee'],
        tags: ['cafe'],
        metadata: null,
        city: 'Hanoi',
        locality: 'Hanoi',
        foursquare_id: null,
        updated_at: new Date().toISOString(),
        venue_activities: [{ activity_id: 4001, source: 'keyword', confidence: 0.6 }],
      },
      catalog: [
        {
          id: 4001,
          slug: 'chess',
          name: 'Chess',
          description: null,
          keywords: ['chess', 'chess club'],
          fsq_categories: [],
        },
      ],
      fsqCategories: new Set<string>(),
      manualOverrides: [],
      activityEvidenceIds: new Set<number>(),
      nowIso: new Date().toISOString(),
    } as Parameters<typeof __activityMatchingTestUtils.computeMatchesForPlace>[0]);

    expect(Array.from(result.matches.keys())).toEqual([]);
    expect(result.deletes).toEqual([4001]);
    expect(result.hospitalityKeywordDeletes).toBe(1);
  });

  test('rejects generic parks for climbing without explicit activity evidence', () => {
    const result = __activityMatchingTestUtils.computeMatchesForPlace({
      place: {
        id: 'place-6',
        name: 'Riverside Park',
        description: 'Large public park with paths and trees',
        categories: ['park'],
        tags: ['garden'],
        metadata: { openstreetmap: { tags: { leisure: 'park' } } },
        city: 'Hanoi',
        locality: 'Hanoi',
        foursquare_id: null,
        updated_at: new Date().toISOString(),
        venue_activities: [],
      },
      catalog: [
        {
          id: 2001,
          slug: 'climbing',
          name: 'Climbing',
          description: null,
          keywords: ['climbing', 'climbing gym'],
          fsq_categories: ['4bf58dd8d48988d1e1931735'],
        },
      ],
      fsqCategories: new Set<string>(),
      manualOverrides: [],
      activityEvidenceIds: new Set<number>(),
      nowIso: new Date().toISOString(),
    } as Parameters<typeof __activityMatchingTestUtils.computeMatchesForPlace>[0]);

    expect(Array.from(result.matches.keys())).toEqual([]);
  });

  test('accepts explicit provider-backed padel venues across providers', () => {
    const result = __activityMatchingTestUtils.computeMatchesForPlace({
      place: {
        id: 'place-7',
        name: 'Hanoi Padel Club',
        description: 'Indoor padel courts',
        categories: ['sports_centre'],
        tags: ['court'],
        metadata: {
          google: { types: ['sports_complex'] },
          openstreetmap: { tags: { sport: 'padel', leisure: 'pitch' } },
          foursquare: { categories: [{ name: 'Padel Court' }] },
        },
        city: 'Hanoi',
        locality: 'Hanoi',
        foursquare_id: 'fsq-1',
        updated_at: new Date().toISOString(),
        venue_activities: [],
      },
      catalog: [
        {
          id: 3001,
          slug: 'padel',
          name: 'Padel',
          description: null,
          keywords: ['padel', 'padel court'],
          fsq_categories: [],
        },
      ],
      fsqCategories: new Set<string>(),
      manualOverrides: [],
      activityEvidenceIds: new Set<number>(),
      nowIso: new Date().toISOString(),
    } as Parameters<typeof __activityMatchingTestUtils.computeMatchesForPlace>[0]);

    expect(Array.from(result.matches.keys())).toEqual([3001]);
    expect(result.upserts[0]?.source).toBe('category');
  });

  test('keeps manual climbing and bouldering mappings for Beefy Boulders My Dinh', () => {
    const result = __activityMatchingTestUtils.computeMatchesForPlace({
      place: {
        id: '45b2cc2b-3e2d-4ab4-baec-e338306af813',
        name: 'Beefy Boulders My Dinh',
        description: 'Indoor climbing gym in Hanoi',
        categories: ['fitness'],
        tags: ['climbing', 'sports_centre'],
        metadata: null,
        city: 'Hanoi',
        locality: 'Hanoi',
        foursquare_id: null,
        updated_at: new Date().toISOString(),
        venue_activities: [{ activity_id: 3, source: 'keyword', confidence: 0.6 }],
      },
      catalog: [
        {
          id: 3,
          slug: 'climbing',
          name: 'Climbing',
          description: null,
          keywords: ['climbing', 'climbing gym'],
          fsq_categories: [],
        },
        {
          id: 17,
          slug: 'bouldering',
          name: 'Bouldering',
          description: null,
          keywords: ['bouldering', 'boulder gym'],
          fsq_categories: [],
        },
      ],
      fsqCategories: new Set<string>(),
      manualOverrides: [
        { activity_id: 3, venue_id: '45b2cc2b-3e2d-4ab4-baec-e338306af813', reason: 'Hanoi climb completeness audit' },
        { activity_id: 17, venue_id: '45b2cc2b-3e2d-4ab4-baec-e338306af813', reason: 'Hanoi climb completeness audit' },
      ],
      activityEvidenceIds: new Set<number>(),
      nowIso: new Date().toISOString(),
    } as Parameters<typeof __activityMatchingTestUtils.computeMatchesForPlace>[0]);

    expect(Array.from(result.matches.keys()).sort((a, b) => a - b)).toEqual([3, 17]);
    expect(result.upserts.map((row) => `${row.activity_id}:${row.source}`).sort()).toEqual(['17:manual', '3:manual']);
    expect(result.manualCount).toBe(2);
  });
});
