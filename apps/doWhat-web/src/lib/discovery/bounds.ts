import type { DiscoveryBounds, DiscoveryQuery } from './engine-core';
import { normalizeRadius, roundCoordinate } from './engine-core';

const METERS_PER_DEGREE_LAT = 111_320;
const DEG_TO_RAD = Math.PI / 180;

const clampLat = (value: number) => Math.min(Math.max(value, -90), 90);
const clampLng = (value: number) => Math.min(Math.max(value, -180), 180);

const normalizeBounds = (bounds: DiscoveryBounds): DiscoveryBounds => {
  const swLat = Number.isFinite(bounds.sw.lat) ? bounds.sw.lat : 0;
  const swLng = Number.isFinite(bounds.sw.lng) ? bounds.sw.lng : 0;
  const neLat = Number.isFinite(bounds.ne.lat) ? bounds.ne.lat : 0;
  const neLng = Number.isFinite(bounds.ne.lng) ? bounds.ne.lng : 0;
  const minLat = clampLat(Math.min(swLat, neLat));
  const maxLat = clampLat(Math.max(swLat, neLat));
  const minLng = clampLng(Math.min(swLng, neLng));
  const maxLng = clampLng(Math.max(swLng, neLng));
  return {
    sw: { lat: roundCoordinate(minLat, 6), lng: roundCoordinate(minLng, 6) },
    ne: { lat: roundCoordinate(maxLat, 6), lng: roundCoordinate(maxLng, 6) },
  };
};

export const resolveDiscoveryBounds = (query: DiscoveryQuery): DiscoveryBounds => {
  if (query.bounds) {
    return normalizeBounds(query.bounds);
  }

  const centerLat = Number.isFinite(query.center.lat) ? query.center.lat : 0;
  const centerLng = Number.isFinite(query.center.lng) ? query.center.lng : 0;
  const radiusMeters = normalizeRadius(query.radiusMeters);
  const latDelta = radiusMeters / METERS_PER_DEGREE_LAT;
  const lngDivisor = Math.cos(centerLat * DEG_TO_RAD);
  const lngDelta = radiusMeters / (METERS_PER_DEGREE_LAT * (Math.abs(lngDivisor) < 0.0001 ? 0.0001 : lngDivisor));

  return normalizeBounds({
    sw: {
      lat: centerLat - latDelta,
      lng: centerLng - lngDelta,
    },
    ne: {
      lat: centerLat + latDelta,
      lng: centerLng + lngDelta,
    },
  });
};
