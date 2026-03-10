import { evaluateActivityFirstDiscoveryPolicy } from '@dowhat/shared';

import type { ViewportBounds } from '@/lib/places/types';

type PlaceLite = {
  id: string | null;
  name?: string | null;
  lat: number | string | null;
  lng: number | string | null;
  categories?: readonly string[] | null;
  tags?: readonly string[] | null;
};

type InferenceLite = {
  activityTypes: string[] | null;
  taxonomyCategories?: string[] | null;
  structuredActivityTypes?: string[] | null;
  structuredTaxonomyCategories?: string[] | null;
  hasVenueActivityMapping?: boolean;
  hasManualOverride?: boolean;
};

const coerceCoordinate = (value: number | string | null): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeTokens = (values: readonly string[]): string[] =>
  Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0),
    ),
  );

const ACTIVITY_ALIASES: Record<string, string[]> = {
  climbing: ['bouldering'],
  bouldering: ['climbing'],
};

const expandActivityTokens = (values: readonly string[]): string[] => {
  const normalized = normalizeTokens(values);
  const expanded = new Set<string>(normalized);
  normalized.forEach((token) => {
    (ACTIVITY_ALIASES[token] ?? []).forEach((alias) => expanded.add(alias));
  });
  return Array.from(expanded);
};

export const isWithinBounds = (
  lat: number | string | null,
  lng: number | string | null,
  bounds: ViewportBounds,
): boolean => {
  const latValue = coerceCoordinate(lat);
  const lngValue = coerceCoordinate(lng);
  if (latValue == null || lngValue == null) return false;
  return (
    latValue >= bounds.sw.lat &&
    latValue <= bounds.ne.lat &&
    lngValue >= bounds.sw.lng &&
    lngValue <= bounds.ne.lng
  );
};

export const placeMatchesActivityTypes = (
  placeId: string | null,
  selectedActivityTypes: readonly string[],
  inferenceByPlaceId: Map<string, InferenceLite>,
  fallbackActivityTypesByPlaceId?: Map<string, readonly string[]>,
): boolean => {
  if (!placeId) return false;
  const wanted = expandActivityTokens(selectedActivityTypes);
  if (!wanted.length) return true;
  const inference = inferenceByPlaceId.get(placeId)?.activityTypes ?? null;
  const fallback = fallbackActivityTypesByPlaceId?.get(placeId) ?? null;
  const candidateTypes = [
    ...(inference ?? []),
    ...(fallback ?? []),
  ];
  if (!candidateTypes.length) return false;
  const inferred = new Set(expandActivityTokens(candidateTypes));
  return wanted.some((token) => inferred.has(token));
};

export const filterPlacesByActivityContract = <T extends PlaceLite>(
  places: T[],
  options: {
    selectedActivityTypes: readonly string[];
    inferenceByPlaceId: Map<string, InferenceLite>;
    fallbackActivityTypesByPlaceId?: Map<string, readonly string[]>;
    bounds: ViewportBounds;
  },
): T[] => {
  const wanted = expandActivityTokens(options.selectedActivityTypes);
  const isEligiblePlace = (place: T): boolean => {
    const inference = place.id ? options.inferenceByPlaceId.get(place.id) : null;
    const structuredActivityTypes =
      inference && 'structuredActivityTypes' in inference
        ? (inference.structuredActivityTypes ?? null)
        : (inference?.activityTypes ?? null);
    const structuredTaxonomyCategories =
      inference && 'structuredTaxonomyCategories' in inference
        ? (inference.structuredTaxonomyCategories ?? null)
        : (inference?.taxonomyCategories ?? null);
    return evaluateActivityFirstDiscoveryPolicy({
      name: place.name ?? null,
      categories: place.categories ?? null,
      tags: place.tags ?? null,
      activityTypes: structuredActivityTypes,
      taxonomyCategories: structuredTaxonomyCategories,
      hasVenueActivityMapping: inference?.hasVenueActivityMapping ?? false,
      hasManualOverride: inference?.hasManualOverride ?? false,
    }).isEligible;
  };

  if (!wanted.length) {
    return places.filter((place) => isWithinBounds(place.lat, place.lng, options.bounds) && isEligiblePlace(place));
  }
  return places.filter((place) => {
    if (!isWithinBounds(place.lat, place.lng, options.bounds)) return false;
    if (!isEligiblePlace(place)) return false;
    return placeMatchesActivityTypes(
      place.id,
      wanted,
      options.inferenceByPlaceId,
      options.fallbackActivityTypesByPlaceId,
    );
  });
};
