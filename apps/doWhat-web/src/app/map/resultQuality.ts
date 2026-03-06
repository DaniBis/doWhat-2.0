import type { MapActivity } from '@dowhat/shared';

import { haversineMeters } from '@/lib/places/utils';

const GENERIC_LABEL_PATTERNS = [/^nearby\s+(?:spot|activity|venue)$/i, /^[a-z]+\s+spot$/i];

const normalize = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const normalizeSet = (values?: (string | null | undefined)[] | null): Set<string> => {
  const set = new Set<string>();
  (values ?? []).forEach((value) => {
    const token = normalize(value);
    if (token) set.add(token);
  });
  return set;
};

export const isGenericActivityDisplay = (activity: MapActivity, fallbackLabel: string): boolean => {
  const name = normalize(activity.name);
  const placeLabel = normalize(activity.place_label);
  const fallback = normalize(fallbackLabel);
  if (!name && !placeLabel) return true;
  if (name && GENERIC_LABEL_PATTERNS.some((pattern) => pattern.test(name))) return true;
  if (placeLabel && (placeLabel === fallback || GENERIC_LABEL_PATTERNS.some((pattern) => pattern.test(placeLabel)))) {
    return true;
  }
  return false;
};

export const hasTypeIntentMatch = (
  activity: MapActivity,
  tokens: Set<string>,
): boolean => {
  if (!tokens.size) return false;
  const typeTokens = normalizeSet(activity.activity_types);
  const tagTokens = normalizeSet(activity.tags);
  const taxonomyTokens = normalizeSet(activity.taxonomy_categories);
  for (const token of tokens) {
    if (typeTokens.has(token) || tagTokens.has(token) || taxonomyTokens.has(token)) return true;
  }
  return false;
};

export const pruneLowQualitySearchActivities = (input: {
  activities: MapActivity[];
  hasSearch: boolean;
  hasStructuredFilters: boolean;
  searchTokens: string[];
  structuredSearchTokens: string[];
  selectedTypes: string[];
  fallbackLabel: string;
}): MapActivity[] => {
  const { activities, hasSearch, hasStructuredFilters, fallbackLabel } = input;
  if (!activities.length) return activities;
  if (!hasSearch && !hasStructuredFilters) return activities;

  const meaningful = activities.filter((activity) => !isGenericActivityDisplay(activity, fallbackLabel));
  if (!meaningful.length) return activities;

  const intentTokens = new Set<string>([
    ...input.searchTokens.map((value) => normalize(value)).filter(Boolean),
    ...input.structuredSearchTokens.map((value) => normalize(value)).filter(Boolean),
    ...input.selectedTypes.map((value) => normalize(value)).filter(Boolean),
  ]);

  return activities.filter((activity) => {
    if (!isGenericActivityDisplay(activity, fallbackLabel)) return true;
    return hasTypeIntentMatch(activity, intentTokens);
  });
};

const canonicalLabel = (activity: MapActivity): string =>
  normalize(activity.place_label) || normalize(activity.name) || normalize(activity.venue);

const qualityScore = (activity: MapActivity): number => {
  const typeCount = (activity.activity_types ?? []).filter(Boolean).length;
  const tagCount = (activity.tags ?? []).filter(Boolean).length;
  const sourceBonus = activity.source === 'postgis' ? 4 : activity.source === 'supabase-places' ? 3 : activity.source === 'supabase-venues' ? 1 : 0;
  const placeBonus = activity.place_id ? 2 : 0;
  return typeCount * 3 + tagCount * 2 + sourceBonus + placeBonus;
};

export const dedupeNearDuplicateActivities = (
  activities: MapActivity[],
  proximityMeters = 90,
): MapActivity[] => {
  if (activities.length < 2) return activities;

  const result: MapActivity[] = [];

  for (const candidate of activities) {
    const candidateLabel = canonicalLabel(candidate);
    if (!candidateLabel) {
      result.push(candidate);
      continue;
    }

    const index = result.findIndex((existing) => {
      const existingPlaceId = normalize(existing.place_id);
      const candidatePlaceId = normalize(candidate.place_id);
      if (existingPlaceId && candidatePlaceId) {
        return existingPlaceId === candidatePlaceId;
      }

      const existingLabel = canonicalLabel(existing);
      if (!existingLabel || existingLabel !== candidateLabel) return false;
      if (!Number.isFinite(existing.lat) || !Number.isFinite(existing.lng)) return false;
      if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) return false;
      return haversineMeters(existing.lat, existing.lng, candidate.lat, candidate.lng) <= proximityMeters;
    });

    if (index < 0) {
      result.push(candidate);
      continue;
    }

    const existing = result[index];
    if (qualityScore(candidate) > qualityScore(existing)) {
      result[index] = candidate;
    }
  }

  return result;
};
