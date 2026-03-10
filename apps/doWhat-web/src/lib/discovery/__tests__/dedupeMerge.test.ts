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
});
