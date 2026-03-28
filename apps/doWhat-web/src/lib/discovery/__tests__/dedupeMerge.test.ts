import { __discoveryEngineTestUtils } from '@/lib/discovery/engine';

describe('discovery dedupe merge', () => {
  test('merges fallback items by place identity and keeps primary item', () => {
    const primary = [
      {
        id: 'activity-1',
        name: 'Wall Hub Climbing',
        place_id: 'place-1',
        place_label: 'Wall Hub',
        lat: 13.75,
        lng: 100.55,
      },
    ];
    const fallback = [
      {
        id: 'fallback-1',
        name: 'Wall Hub Climbing',
        place_id: 'place-1',
        place_label: 'Wall Hub',
        lat: 13.7501,
        lng: 100.5501,
      },
      {
        id: 'fallback-2',
        name: 'City Park',
        place_id: 'place-2',
        place_label: 'City Park',
        lat: 13.752,
        lng: 100.558,
      },
    ];

    const merged = __discoveryEngineTestUtils.mergeActivitiesWithFallback(
      primary as Parameters<typeof __discoveryEngineTestUtils.mergeActivitiesWithFallback>[0],
      fallback as Parameters<typeof __discoveryEngineTestUtils.mergeActivitiesWithFallback>[1],
    );

    expect(merged.map((item) => item.id)).toEqual(['activity-1', 'fallback-2']);
  });

  test('collapses near-duplicate place and venue rows with different source ids', () => {
    const merged = __discoveryEngineTestUtils.mergeActivitiesWithFallback(
      [
        {
          id: 'venue:db0bd877-08a5-42f9-9dfc-cc3f9a6d864a',
          name: 'VietClimb',
          place_id: 'db0bd877-08a5-42f9-9dfc-cc3f9a6d864a',
          place_label: 'VietClimb',
          lat: 21.054838,
          lng: 105.83981,
          source: 'supabase-venues',
          activity_types: [],
          tags: [],
        },
        {
          id: 'place:3d9e27a6-c62f-4906-a2cf-5d7b406e82fd',
          name: 'VietClimb',
          place_id: '3d9e27a6-c62f-4906-a2cf-5d7b406e82fd',
          place_label: 'VietClimb',
          lat: 21.0548381,
          lng: 105.8398098,
          source: 'supabase-places',
          activity_types: ['climbing'],
          tags: ['climbing'],
        },
      ] as Parameters<typeof __discoveryEngineTestUtils.mergeActivitiesWithFallback>[0],
      [],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('place:3d9e27a6-c62f-4906-a2cf-5d7b406e82fd');
    expect(merged[0]?.activity_types).toEqual(['climbing']);
  });

  test('keeps nearby items when both sides already have different canonical place ids', () => {
    const merged = __discoveryEngineTestUtils.mergeActivitiesWithFallback(
      [
        {
          id: 'place:one',
          name: 'Park Climbing Wall',
          place_id: '11111111-1111-4111-8111-111111111111',
          place_label: 'Park Climbing Wall',
          lat: 21.0285,
          lng: 105.8542,
          source: 'supabase-places',
        },
        {
          id: 'place:two',
          name: 'Park Climbing Wall',
          place_id: '22222222-2222-4222-8222-222222222222',
          place_label: 'Park Climbing Wall',
          lat: 21.02852,
          lng: 105.85422,
          source: 'supabase-places',
        },
      ] as Parameters<typeof __discoveryEngineTestUtils.mergeActivitiesWithFallback>[0],
      [],
    );

    expect(merged).toHaveLength(2);
  });

  test('Hanoi launch shield keeps the stronger activity-backed candidate for same-name same-location duplicates', () => {
    const shielded = __discoveryEngineTestUtils.applyHanoiLaunchShield(
      [
        {
          id: 'venue:weak',
          name: 'VietClimb',
          place_id: '11111111-1111-4111-8111-111111111111',
          place_label: 'VietClimb',
          lat: 21.054838,
          lng: 105.83981,
          source: 'supabase-venues',
          tags: ['cafe'],
          verification_state: 'suggested',
        },
        {
          id: 'place:strong',
          name: 'VietClimb',
          place_id: '22222222-2222-4222-8222-222222222222',
          place_label: 'VietClimb',
          lat: 21.0548381,
          lng: 105.8398098,
          source: 'supabase-places',
          activity_types: ['climbing_bouldering'],
          taxonomy_categories: ['fitness'],
          upcoming_session_count: 3,
          verification_state: 'verified',
        },
      ] as Parameters<typeof __discoveryEngineTestUtils.applyHanoiLaunchShield>[0],
      { lat: 21.0285, lng: 105.8542 },
    );

    expect(shielded).toHaveLength(1);
    expect(shielded[0]?.id).toBe('place:strong');
    expect(shielded[0]?.activity_types).toEqual(['climbing_bouldering']);
  });

  test('Hanoi launch shield suppresses unnamed duplicate clusters without activity evidence', () => {
    const shielded = __discoveryEngineTestUtils.applyHanoiLaunchShield(
      [
        {
          id: 'place:unnamed-1',
          name: 'Unnamed place',
          place_id: '33333333-3333-4333-8333-333333333333',
          place_label: 'Unnamed place',
          lat: 21.029,
          lng: 105.852,
          source: 'supabase-places',
          tags: ['coffee'],
        },
        {
          id: 'place:unnamed-2',
          name: 'Unnamed place',
          place_id: '44444444-4444-4444-8444-444444444444',
          place_label: 'Unnamed place',
          lat: 21.02902,
          lng: 105.85202,
          source: 'supabase-places',
          tags: ['bar'],
        },
        {
          id: 'place:real',
          name: 'West Lake Climbing Gym',
          place_id: '55555555-5555-4555-8555-555555555555',
          place_label: 'West Lake Climbing Gym',
          lat: 21.03,
          lng: 105.853,
          source: 'supabase-places',
          activity_types: ['climbing_bouldering'],
        },
      ] as Parameters<typeof __discoveryEngineTestUtils.applyHanoiLaunchShield>[0],
      { lat: 21.0285, lng: 105.8542 },
    );

    expect(shielded.map((item) => item.id)).toEqual(['place:real']);
  });

  test('Hanoi launch shield does not let low-signal food-drink duplicates beat a real activity venue', () => {
    const shielded = __discoveryEngineTestUtils.applyHanoiLaunchShield(
      [
        {
          id: 'place:noise',
          name: 'The Outpost',
          place_id: '66666666-6666-4666-8666-666666666666',
          place_label: 'The Outpost',
          lat: 21.031,
          lng: 105.85,
          source: 'supabase-places',
          tags: ['restaurant', 'cocktail'],
          verification_state: 'verified',
        },
        {
          id: 'place:activity',
          name: 'The Outpost',
          place_id: '77777777-7777-4777-8777-777777777777',
          place_label: 'The Outpost',
          lat: 21.03101,
          lng: 105.85001,
          source: 'supabase-places',
          activity_types: ['yoga'],
          taxonomy_categories: ['fitness'],
          starts_at: '2026-04-01T10:00:00.000Z',
          verification_state: 'needs_votes',
        },
      ] as Parameters<typeof __discoveryEngineTestUtils.applyHanoiLaunchShield>[0],
      { lat: 21.0285, lng: 105.8542 },
    );

    expect(shielded).toHaveLength(1);
    expect(shielded[0]?.id).toBe('place:activity');
  });

  test('Hanoi launch shield keeps legitimate distinct nearby activity venues visible', () => {
    const shielded = __discoveryEngineTestUtils.applyHanoiLaunchShield(
      [
        {
          id: 'place:alpha',
          name: 'Alpha Climb Studio',
          place_id: '88888888-8888-4888-8888-888888888888',
          place_label: 'Alpha Climb Studio',
          lat: 21.04,
          lng: 105.86,
          source: 'supabase-places',
          activity_types: ['climbing_bouldering'],
        },
        {
          id: 'place:beta',
          name: 'Beta Yoga Loft',
          place_id: '99999999-9999-4999-8999-999999999999',
          place_label: 'Beta Yoga Loft',
          lat: 21.04006,
          lng: 105.86004,
          source: 'supabase-places',
          activity_types: ['yoga'],
        },
      ] as Parameters<typeof __discoveryEngineTestUtils.applyHanoiLaunchShield>[0],
      { lat: 21.0285, lng: 105.8542 },
    );

    expect(shielded.map((item) => item.id)).toEqual(['place:alpha', 'place:beta']);
  });

  test('launch-visible browse policy suppresses weak community-centre rows but keeps running parks', () => {
    const gated = __discoveryEngineTestUtils.applyLaunchVisibleBrowsePolicy([
      {
        id: 'place:community-dance',
        name: 'Hanoi Creative City',
        place_id: 'aaaaaaa1-1111-4111-8111-111111111111',
        place_label: 'Hanoi Creative City',
        lat: 21.03,
        lng: 105.84,
        source: 'supabase-places',
        activity_types: ['dancing', 'chess', 'pottery'],
        tags: ['community centre'],
        verification_state: 'suggested',
      },
      {
        id: 'place:run-park',
        name: 'West Lake Park',
        place_id: 'bbbbbbb2-2222-4222-8222-222222222222',
        place_label: 'West Lake Park',
        lat: 21.031,
        lng: 105.841,
        source: 'supabase-places',
        activity_types: ['running'],
        tags: ['park'],
        verification_state: 'suggested',
      },
    ] as Parameters<typeof __discoveryEngineTestUtils.applyLaunchVisibleBrowsePolicy>[0]);

    expect(gated.droppedCount).toBe(1);
    expect(gated.items.map((item) => item.id)).toEqual(['place:run-park']);
  });

  test('launch-visible browse policy drops no-query Hanoi rows with no canonical visible activity type', () => {
    const gated = __discoveryEngineTestUtils.applyLaunchVisibleBrowsePolicy([
      {
        id: 'place:childrens-palace',
        name: 'Cung Thiếu nhi Hà Nội',
        place_id: 'eeeeeee5-5555-4555-8555-555555555555',
        place_label: 'Cung Thiếu nhi Hà Nội',
        lat: 21.032,
        lng: 105.844,
        source: 'supabase-places',
        activity_types: null,
        tags: ['youth centre'],
        verification_state: 'suggested',
      },
      {
        id: 'place:running-ok',
        name: 'West Lake Track',
        place_id: 'fffffff6-6666-4666-8666-666666666666',
        place_label: 'West Lake Track',
        lat: 21.033,
        lng: 105.845,
        source: 'supabase-places',
        activity_types: ['running'],
        tags: ['running track'],
        verification_state: 'suggested',
      },
    ] as Parameters<typeof __discoveryEngineTestUtils.applyLaunchVisibleBrowsePolicy>[0]);

    expect(gated.droppedCount).toBe(1);
    expect(gated.items.map((item) => item.id)).toEqual(['place:running-ok']);
  });

  test('cached discovery rebuild applies the same launch-visible browse suppression', () => {
    const cacheResult = __discoveryEngineTestUtils.buildCacheResult(
      {
        cachedAt: '2026-04-01T00:00:00.000Z',
        expiresAt: '2026-04-01T00:05:00.000Z',
        items: [
          {
            id: 'place:climb-noise',
            name: 'Central Park',
            place_id: 'ccccccc3-3333-4333-8333-333333333333',
            place_label: 'Central Park',
            lat: 21.032,
            lng: 105.842,
            source: 'supabase-places',
            activity_types: ['climbing', 'dancing'],
            tags: ['park'],
            verification_state: 'suggested',
          },
          {
            id: 'place:running-ok',
            name: 'West Lake Park',
            place_id: 'ddddddd4-4444-4444-8444-444444444444',
            place_label: 'West Lake Park',
            lat: 21.033,
            lng: 105.843,
            source: 'supabase-places',
            activity_types: ['running'],
            tags: ['park'],
            verification_state: 'suggested',
          },
        ],
        filterSupport: {
          activityTypes: true,
          tags: true,
          traits: true,
          taxonomyCategories: true,
          priceLevels: true,
          capacityKey: true,
          timeWindow: true,
        },
        sourceBreakdown: { 'supabase-places': 2 },
      } as any,
      {
        center: { lat: 21.0285, lng: 105.8542 },
        radiusMeters: 2000,
        limit: 10,
        filters: {},
      },
      'cache-key',
    );

    expect(cacheResult.items.map((item) => item.id)).toEqual(['place:running-ok']);
    expect(cacheResult.items[0]?.activity_types).toEqual(['running']);
  });
});
