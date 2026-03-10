import {
  filterPlacesByActivityContract,
  isWithinBounds,
  placeMatchesActivityTypes,
} from '@/lib/discovery/placeActivityFilter';

describe('place activity filter contract', () => {
  const bounds = {
    sw: { lat: 44.35, lng: 26.0 },
    ne: { lat: 44.5, lng: 26.2 },
  };

  test('returns all in-bounds places that match selected activity inference', () => {
    const places = [
      { id: 'p1', lat: 44.401, lng: 26.102 },
      { id: 'p2', lat: 44.403, lng: 26.105 },
      { id: 'p3', lat: 44.406, lng: 26.11 },
      { id: 'p4', lat: 44.59, lng: 26.12 }, // out of bounds
    ];
    const inferenceByPlaceId = new Map([
      ['p1', { activityTypes: ['bouldering', 'climbing'] }],
      ['p2', { activityTypes: ['bouldering'] }],
      ['p3', { activityTypes: ['chess'] }],
      ['p4', { activityTypes: ['bouldering'] }],
    ]);

    const result = filterPlacesByActivityContract(places, {
      selectedActivityTypes: ['bouldering'],
      inferenceByPlaceId,
      bounds,
    });

    expect(result.map((row) => row.id)).toEqual(['p1', 'p2']);
  });

  test('does not collapse to single dominant activity when mixed inputs exist', () => {
    const places = [
      { id: 'chess-1', lat: 44.402, lng: 26.111 },
      { id: 'boulder-1', lat: 44.403, lng: 26.112 },
      { id: 'boulder-2', lat: 44.404, lng: 26.113 },
      { id: 'yoga-1', lat: 44.405, lng: 26.114 },
    ];
    const inferenceByPlaceId = new Map([
      ['chess-1', { activityTypes: ['chess'] }],
      ['boulder-1', { activityTypes: ['bouldering'] }],
      ['boulder-2', { activityTypes: ['bouldering', 'climbing'] }],
      ['yoga-1', { activityTypes: ['yoga'] }],
    ]);

    const bouldering = filterPlacesByActivityContract(places, {
      selectedActivityTypes: ['bouldering'],
      inferenceByPlaceId,
      bounds,
    });
    const chess = filterPlacesByActivityContract(places, {
      selectedActivityTypes: ['chess'],
      inferenceByPlaceId,
      bounds,
    });

    expect(bouldering.map((row) => row.id)).toEqual(['boulder-1', 'boulder-2']);
    expect(chess.map((row) => row.id)).toEqual(['chess-1']);
  });

  test('helpers enforce bounds and inference matching deterministically', () => {
    const inferenceByPlaceId = new Map([
      ['p1', { activityTypes: ['bouldering'] }],
    ]);

    expect(isWithinBounds(44.4, 26.1, bounds)).toBe(true);
    expect(isWithinBounds(44.8, 26.1, bounds)).toBe(false);
    expect(placeMatchesActivityTypes('p1', ['bouldering'], inferenceByPlaceId)).toBe(true);
    expect(placeMatchesActivityTypes('p1', ['chess'], inferenceByPlaceId)).toBe(false);
    expect(placeMatchesActivityTypes('missing', ['bouldering'], inferenceByPlaceId)).toBe(false);
  });

  test('treats climbing and bouldering as compatible filter aliases', () => {
    const inferenceByPlaceId = new Map([
      ['p1', { activityTypes: ['climbing'] }],
      ['p2', { activityTypes: ['bouldering'] }],
    ]);

    expect(placeMatchesActivityTypes('p1', ['bouldering'], inferenceByPlaceId)).toBe(true);
    expect(placeMatchesActivityTypes('p2', ['climbing'], inferenceByPlaceId)).toBe(true);
  });

  test('uses fallback activity types map when inference rows are missing', () => {
    const inferenceByPlaceId = new Map<string, { activityTypes: string[] | null }>();
    const fallbackByPlaceId = new Map<string, readonly string[]>([
      ['p1', ['climbing']],
      ['p2', ['yoga']],
    ]);

    expect(placeMatchesActivityTypes('p1', ['climbing'], inferenceByPlaceId, fallbackByPlaceId)).toBe(true);
    expect(placeMatchesActivityTypes('p1', ['bouldering'], inferenceByPlaceId, fallbackByPlaceId)).toBe(true);
    expect(placeMatchesActivityTypes('p2', ['climbing'], inferenceByPlaceId, fallbackByPlaceId)).toBe(false);
  });

  test('does not let hospitality-only places survive on fallback activity guesses alone', () => {
    const places = [
      { id: 'cafe-1', name: 'Chess Cafe', lat: 44.401, lng: 26.102, categories: ['coffee'], tags: ['cafe'] },
      { id: 'gym-1', name: 'Peak Climb', lat: 44.402, lng: 26.103, categories: ['climbing'], tags: ['bouldering'] },
    ];
    const inferenceByPlaceId = new Map<string, { activityTypes: string[] | null }>();
    const fallbackByPlaceId = new Map<string, readonly string[]>([
      ['cafe-1', ['chess']],
      ['gym-1', ['climbing']],
    ]);

    const result = filterPlacesByActivityContract(places, {
      selectedActivityTypes: ['climbing', 'chess'],
      inferenceByPlaceId,
      fallbackActivityTypesByPlaceId: fallbackByPlaceId,
      bounds,
    });

    expect(result.map((row) => row.id)).toEqual(['gym-1']);
  });
});
