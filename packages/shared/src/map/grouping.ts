import type { MapActivity } from './types';

const normaliseWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const cleanupName = (value: string) =>
  normaliseWhitespace(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, ' ')
      .replace(/\b(the|club|centre|center|gym|studio|association|society|team|group)\b/g, '')
      .replace(/\s{2,}/g, ' '),
  );

const coordinateKey = (lat: number | null | undefined, lng: number | null | undefined) => {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return 'unknown';
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
};

export type ActivityLocationSummary = {
  key: string;
  lat: number | null;
  lng: number | null;
  venue?: string | null;
  activities: MapActivity[];
};

export type ActivityGroup = {
  key: string;
  name: string;
  activities: MapActivity[];
  locations: ActivityLocationSummary[];
  count: number;
};

export const groupActivitiesByName = (activities: MapActivity[]): ActivityGroup[] => {
  const groups = new Map<string, ActivityGroup>();
  activities.forEach((activity) => {
    const label = normaliseWhitespace(activity.name || '').trim();
    if (!label) return;
    const key = cleanupName(label) || label.toLowerCase();
    const lat = typeof activity.lat === 'number' ? activity.lat : null;
    const lng = typeof activity.lng === 'number' ? activity.lng : null;
    const locationKey = coordinateKey(lat, lng) + `|${activity.venue ?? ''}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: label,
        activities: [],
        locations: [],
        count: 0,
      };
      groups.set(key, group);
    }
    group.activities.push(activity);
    group.count += 1;

    let location = group.locations.find((loc) => loc.key === locationKey);
    if (!location) {
      location = {
        key: locationKey,
        lat,
        lng,
        venue: activity.venue ?? null,
        activities: [],
      };
      group.locations.push(location);
    }
    location.activities.push(activity);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      locations: group.locations.sort((a, b) => {
        const aVenue = normaliseWhitespace(a.venue ?? '').toLowerCase();
        const bVenue = normaliseWhitespace(b.venue ?? '').toLowerCase();
        return aVenue.localeCompare(bVenue);
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const normaliseActivityName = (value: string): string => cleanupName(value) || normaliseWhitespace(value).toLowerCase();
