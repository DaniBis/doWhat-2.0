import { resolveMapCenterFromSession } from '../highlightSession';

describe('resolveMapCenterFromSession', () => {
  it('prefers place coordinates', () => {
    const center = resolveMapCenterFromSession({
      place: { lat: 21.0554321, lng: 105.8398765 },
      venue: { lat: 21.1, lng: 105.8 },
    });
    expect(center).toEqual({ lat: 21.055432, lng: 105.839877 });
  });

  it('falls back to venue then activity then direct coords', () => {
    expect(resolveMapCenterFromSession({ venue: { lat: 21.07, lng: 105.82 } })).toEqual({ lat: 21.07, lng: 105.82 });
    expect(resolveMapCenterFromSession({ activity: { lat: 21.08, lng: 105.81 } })).toEqual({ lat: 21.08, lng: 105.81 });
    expect(resolveMapCenterFromSession({ lat: 21.09, lng: 105.8 })).toEqual({ lat: 21.09, lng: 105.8 });
  });

  it('returns null when no usable coordinates are present', () => {
    expect(resolveMapCenterFromSession({ place: { lat: null, lng: null } })).toBeNull();
    expect(resolveMapCenterFromSession(null)).toBeNull();
  });
});
