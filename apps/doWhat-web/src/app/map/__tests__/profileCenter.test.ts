import { parseCoordinateLabel, resolveMapCenterFromProfile } from '../profileCenter';

describe('map profile center resolution', () => {
  it('prefers explicit profile coordinates when present', () => {
    const center = resolveMapCenterFromProfile({
      location: 'Old place',
      locationLat: 51.5074,
      locationLng: -0.1278,
    });

    expect(center).toEqual({ lat: 51.5074, lng: -0.1278 });
  });

  it('falls back to parsing coordinate label string', () => {
    const center = resolveMapCenterFromProfile({
      location: '15.905, 108.329',
    });

    expect(center).toEqual({ lat: 15.905, lng: 108.329 });
  });

  it('returns null for free-text location labels', () => {
    const center = resolveMapCenterFromProfile({
      location: 'London, United Kingdom',
    });

    expect(center).toBeNull();
    expect(parseCoordinateLabel('London, United Kingdom')).toBeNull();
  });
});
