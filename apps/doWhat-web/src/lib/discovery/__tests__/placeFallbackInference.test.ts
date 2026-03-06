import { __discoveryEngineTestUtils } from '../engine';

describe('place fallback activity inference', () => {
  test('infers climbing from stemmed venue names', () => {
    const types = __discoveryEngineTestUtils.buildPlaceActivityTypes({
      id: 'place-1',
      name: 'VietClimb Indoor Gym',
      address: 'Hanoi',
      lat: 21.03,
      lng: 105.84,
      tags: ['fitness'],
      categories: ['sports_centre'],
    } as any);

    expect(types).toContain('climbing');
  });

  test('infers bouldering/climbing from Thai text hints', () => {
    const types = __discoveryEngineTestUtils.buildPlaceActivityTypes({
      id: 'place-2',
      name: 'ยิมปีนผา กรุงเทพ',
      address: 'Bangkok',
      lat: 13.75,
      lng: 100.5,
      tags: [],
      categories: ['fitness'],
    } as any);

    expect(types).toEqual(expect.arrayContaining(['climbing']));
  });
});
