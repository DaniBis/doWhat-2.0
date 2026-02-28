import { isUuid, type MapActivity } from '@dowhat/shared';

import { extractActivitySearchTokens } from '../map/searchTokens';

export type VenueOption = { id: string; name: string };

export const CREATE_VENUE_BASE_RADIUS_METERS = 12_500;
export const CREATE_VENUE_FILTERED_RADIUS_METERS = 25_000;
export const CREATE_VENUE_BASE_LIMIT = 200;
export const CREATE_VENUE_FILTERED_LIMIT = 400;

const normalizeLabel = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

export const resolveVenueDiscoveryTokens = (activityLabel: string): string[] => {
  const normalized = activityLabel.trim().toLowerCase();
  if (!normalized) return [];
  return extractActivitySearchTokens(normalized);
};

export const buildVenueDiscoveryQuery = (input: {
  lat: number;
  lng: number;
  activityLabel: string;
}) => {
  const tokens = resolveVenueDiscoveryTokens(input.activityLabel);
  const hasFilters = tokens.length > 0;
  return {
    radiusMeters: hasFilters ? CREATE_VENUE_FILTERED_RADIUS_METERS : CREATE_VENUE_BASE_RADIUS_METERS,
    limit: hasFilters ? CREATE_VENUE_FILTERED_LIMIT : CREATE_VENUE_BASE_LIMIT,
    types: tokens,
  };
};

export const mapActivitiesToVenueOptions = (activities: MapActivity[]): VenueOption[] => {
  const seenByName = new Set<string>();
  const options: VenueOption[] = [];

  const ordered = [...activities].sort(
    (a, b) => (a.distance_m ?? Number.POSITIVE_INFINITY) - (b.distance_m ?? Number.POSITIVE_INFINITY),
  );

  for (const activity of ordered) {
    const label =
      normalizeLabel(activity.place_label)
      || normalizeLabel(activity.name)
      || normalizeLabel(activity.venue);
    if (!label) continue;

    const key = label.toLowerCase();
    if (seenByName.has(key)) continue;
    seenByName.add(key);

    const optionId = isUuid(activity.id)
      ? activity.id
      : activity.place_id
        ? `place:${activity.place_id}`
        : activity.id;

    options.push({ id: optionId, name: label });
  }

  return options;
};

export const suggestVenueOptions = (
  options: VenueOption[],
  query: string,
  limit = 5,
): VenueOption[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

  const scored = options
    .map((option) => {
      const label = option.name.trim().toLowerCase();
      if (!label) return null;

      let score = Number.POSITIVE_INFINITY;
      if (label === normalizedQuery) {
        score = 0;
      } else if (label.startsWith(normalizedQuery)) {
        score = 1;
      } else if (label.includes(normalizedQuery)) {
        score = 2;
      } else if (queryTokens.length && queryTokens.every((token) => label.includes(token))) {
        score = 3;
      }

      if (!Number.isFinite(score)) return null;
      return { option, score, labelLength: label.length };
    })
    .filter((entry): entry is { option: VenueOption; score: number; labelLength: number } => Boolean(entry));

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.labelLength !== b.labelLength) return a.labelLength - b.labelLength;
    return a.option.name.localeCompare(b.option.name);
  });

  return scored.slice(0, Math.max(1, limit)).map((entry) => entry.option);
};
