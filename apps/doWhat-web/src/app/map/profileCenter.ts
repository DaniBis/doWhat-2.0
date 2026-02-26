import type { MapCoordinates } from '@dowhat/shared';

export type MapProfileLocationPayload = {
  location?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
};

const isFiniteCoordinate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const isValidMapCoordinatePair = (lat: unknown, lng: unknown): boolean => {
  if (!isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

export const parseCoordinateLabel = (value?: string | null): MapCoordinates | null => {
  if (!value) return null;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number.parseFloat(match[1]);
  const lng = Number.parseFloat(match[2]);
  if (!isValidMapCoordinatePair(lat, lng)) return null;
  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
  };
};

export const resolveMapCenterFromProfile = (
  profile: MapProfileLocationPayload | null | undefined,
): MapCoordinates | null => {
  if (!profile) return null;
  const lat = profile.locationLat;
  const lng = profile.locationLng;
  if (isValidMapCoordinatePair(lat, lng) && typeof lat === 'number' && typeof lng === 'number') {
    return {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
    };
  }
  return parseCoordinateLabel(profile.location);
};
