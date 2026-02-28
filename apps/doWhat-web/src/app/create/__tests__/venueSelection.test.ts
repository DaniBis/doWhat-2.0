import { parseVenueSelection } from '../venueSelection';

describe('parseVenueSelection', () => {
  test('parses place-prefixed ids', () => {
    const parsed = parseVenueSelection('place:3d9e27a6-c62f-4906-a2cf-5d7b406e82fd');
    expect(parsed).toEqual({
      venueId: '',
      placeId: '3d9e27a6-c62f-4906-a2cf-5d7b406e82fd',
    });
  });

  test('parses venue-prefixed ids', () => {
    const parsed = parseVenueSelection('venue:db0bd877-08a5-42f9-9dfc-cc3f9a6d864a');
    expect(parsed).toEqual({
      venueId: 'db0bd877-08a5-42f9-9dfc-cc3f9a6d864a',
      placeId: '',
    });
  });

  test('rejects malformed ids', () => {
    expect(parseVenueSelection('place:not-a-uuid')).toEqual({ venueId: '', placeId: '' });
    expect(parseVenueSelection('random')).toEqual({ venueId: '', placeId: '' });
  });
});
