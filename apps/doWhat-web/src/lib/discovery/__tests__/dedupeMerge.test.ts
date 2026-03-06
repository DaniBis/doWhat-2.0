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
});
