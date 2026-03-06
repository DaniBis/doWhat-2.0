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
      nowIso: new Date().toISOString(),
    } as Parameters<typeof __activityMatchingTestUtils.computeMatchesForPlace>[0]);

    expect(Array.from(result.matches.keys()).sort((a, b) => a - b)).toEqual([3001, 3002]);
  });
});
