import type { MapCoordinates } from '@dowhat/shared';

type MaybeCoord = number | null | undefined;

const toFiniteCoord = (value: MaybeCoord): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(6)) : null;

const resolvePair = (lat: MaybeCoord, lng: MaybeCoord): MapCoordinates | null => {
  const nextLat = toFiniteCoord(lat);
  const nextLng = toFiniteCoord(lng);
  if (nextLat == null || nextLng == null) return null;
  return { lat: nextLat, lng: nextLng };
};

export const resolveMapCenterFromSession = (session: unknown): MapCoordinates | null => {
  if (!session || typeof session !== 'object') return null;
  const row = session as Record<string, unknown>;

  const place = typeof row.place === 'object' && row.place ? (row.place as Record<string, unknown>) : null;
  const venue = typeof row.venue === 'object' && row.venue ? (row.venue as Record<string, unknown>) : null;
  const activity = typeof row.activity === 'object' && row.activity ? (row.activity as Record<string, unknown>) : null;

  const fromPlace = resolvePair(place?.lat as MaybeCoord, place?.lng as MaybeCoord);
  if (fromPlace) return fromPlace;

  const fromVenue = resolvePair(venue?.lat as MaybeCoord, venue?.lng as MaybeCoord);
  if (fromVenue) return fromVenue;

  const fromActivity = resolvePair(activity?.lat as MaybeCoord, activity?.lng as MaybeCoord);
  if (fromActivity) return fromActivity;

  const direct = resolvePair(row.lat as MaybeCoord, row.lng as MaybeCoord);
  if (direct) return direct;

  return null;
};
