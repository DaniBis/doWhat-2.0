import {
  canonicalizeKnownCityFields,
  normalizeCityScopeValue,
  resolveCityScope,
  resolveCityScopeForCoordinate,
} from '@/lib/places/cityScope';

describe('launch city scope helpers', () => {
  test('resolveCityScope accepts accent and spacing variants', () => {
    expect(resolveCityScope('Hà Nội')?.slug).toBe('hanoi');
    expect(resolveCityScope('Da Nang')?.slug).toBe('danang');
    expect(resolveCityScope('กรุงเทพมหานคร')?.slug).toBe('bangkok');
    expect(normalizeCityScopeValue('Đà Nẵng')).toBe('danang');
  });

  test('resolveCityScopeForCoordinate uses launch city bbox', () => {
    expect(resolveCityScopeForCoordinate({ lat: 21.0285, lng: 105.8542 })?.slug).toBe('hanoi');
    expect(resolveCityScopeForCoordinate({ lat: 16.0544, lng: 108.2022 })?.slug).toBe('danang');
  });

  test('canonicalizeKnownCityFields preserves district locality but normalizes canonical city', () => {
    expect(
      canonicalizeKnownCityFields({
        lat: 13.7563,
        lng: 100.5018,
        city: 'คลองเตย',
        locality: 'คลองเตย',
      }),
    ).toEqual({
      city: 'Bangkok',
      locality: 'คลองเตย',
      matchedCitySlug: 'bangkok',
    });
  });

  test('canonicalizeKnownCityFields removes duplicate city aliases from locality', () => {
    expect(
      canonicalizeKnownCityFields({
        lat: 21.0285,
        lng: 105.8542,
        city: 'Hà Nội',
        locality: 'Hà Nội',
      }),
    ).toEqual({
      city: 'Hanoi',
      locality: null,
      matchedCitySlug: 'hanoi',
    });
  });

  test('canonicalizeKnownCityFields fills canonical city when city fields are missing', () => {
    expect(
      canonicalizeKnownCityFields({
        lat: 16.061,
        lng: 108.223,
        city: null,
        locality: null,
      }),
    ).toEqual({
      city: 'Da Nang',
      locality: null,
      matchedCitySlug: 'danang',
    });
  });
});
