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

  test('suppresses generic parks for specific indoor activities', () => {
    const types = __discoveryEngineTestUtils.buildPlaceActivityTypes({
      id: 'place-3',
      name: 'Central Park',
      address: 'Hanoi',
      lat: 21.03,
      lng: 105.84,
      tags: ['garden'],
      categories: ['park'],
    } as any);

    expect(types ?? []).not.toContain('climbing');
    expect(types ?? []).not.toContain('padel');
  });

  test('suppresses weak Hanoi community-centre browse inference for venue-bound activities', () => {
    const types = __discoveryEngineTestUtils.buildPlaceActivityTypes({
      id: 'place-5',
      name: 'Hanoi Creative City',
      address: 'Hanoi',
      lat: 21.03,
      lng: 105.84,
      tags: ['community centre'],
      categories: ['community center'],
    } as any);

    expect(types ?? []).not.toContain('climbing');
    expect(types ?? []).not.toContain('boxing');
    expect(types ?? []).not.toContain('dancing');
    expect(types ?? []).not.toContain('chess');
    expect(types ?? []).not.toContain('pottery');
    expect(types ?? []).not.toContain('padel');
  });

  test('suppresses unnamed and civic rows from launch-visible fallback inference', () => {
    const unnamed = __discoveryEngineTestUtils.buildPlaceActivityTypes({
      id: 'place-7',
      name: 'Unnamed place',
      address: 'Hanoi',
      lat: 21.03,
      lng: 105.84,
      tags: ['community centre'],
      categories: ['community center'],
    } as any);

    const civic = __discoveryEngineTestUtils.buildPlaceActivityTypes({
      id: 'place-8',
      name: 'Cung Thiếu nhi Hà Nội',
      address: 'Hanoi',
      lat: 21.03,
      lng: 105.84,
      tags: ['youth centre'],
      categories: ['public hall'],
    } as any);

    expect(unnamed).toBeNull();
    expect(civic ?? []).not.toContain('dancing');
    expect(civic ?? []).not.toContain('chess');
  });

  test('keeps legitimate running area inference for park-shaped places', () => {
    const types = __discoveryEngineTestUtils.buildPlaceActivityTypes({
      id: 'place-6',
      name: 'West Lake Park',
      address: 'Hanoi',
      lat: 21.03,
      lng: 105.84,
      tags: ['green space'],
      categories: ['park'],
    } as any);

    expect(types ?? []).toContain('running');
  });

  test('returns deterministic fallback inference for repeated cache rebuilds', () => {
    const row = {
      id: 'place-4',
      name: 'Clay Lab Hanoi',
      address: 'Hanoi',
      lat: 21.03,
      lng: 105.84,
      tags: ['pottery', 'craft'],
      categories: ['art studio'],
    } as any;

    expect(__discoveryEngineTestUtils.buildPlaceActivityTypes(row)).toEqual(
      __discoveryEngineTestUtils.buildPlaceActivityTypes({ ...row }),
    );
  });

  test('uses paged place fallback for specific activity-intent search text', () => {
    expect(
      __discoveryEngineTestUtils.shouldUsePagedPlaceFallbackQuery({
        filters: { searchText: 'climb' },
      } as any),
    ).toBe(true);

    expect(
      __discoveryEngineTestUtils.shouldUsePagedPlaceFallbackQuery({
        filters: { searchText: 'bouldering' },
      } as any),
    ).toBe(true);

    expect(
      __discoveryEngineTestUtils.shouldUsePagedPlaceFallbackQuery({
        filters: { searchText: 'climb chess' },
      } as any),
    ).toBe(true);

    expect(
      __discoveryEngineTestUtils.shouldUsePagedPlaceFallbackQuery({
        filters: { searchText: 'natural high' },
      } as any),
    ).toBe(false);
  });

  test('suppresses hospitality rows from inheriting running or walking via generic garden text', () => {
    const types = __discoveryEngineTestUtils.buildPlaceActivityTypes({
      id: 'place-10',
      name: 'Bia Hơi Corner',
      address: 'Hanoi',
      lat: 21.03,
      lng: 105.84,
      tags: ['beer garden', 'street food gathering'],
      categories: [],
    } as any);

    expect(types ?? []).not.toContain('running');
    expect(types ?? []).not.toContain('walking');
  });
});
