import {
  DEFAULT_ACTIVITY_FILTER_PREFERENCES,
  type ActivityFilterPreferences,
  discoveryFilterContractsEqual,
  evaluateActivityFirstDiscoveryPolicy,
  stripHospitalityFirstDiscoverySelections,
  type DiscoveryFilterContract,
  type DiscoveryTrustMode,
  type MapCoordinates,
  type PlaceSummary,
  type TimeWindowKey,
} from '@dowhat/shared';

type MobileMapDiscoveryFiltersInput = {
  searchText?: string;
  categories: string[];
  maxDistanceKm?: number | null;
  trustMode?: DiscoveryTrustMode;
};

const normalizeStringArray = (values: readonly string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

const readNumericMetadata = (metadata: Record<string, unknown> | null | undefined, keys: string[]): number | null => {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
};

const readTimestampMetadata = (metadata: Record<string, unknown> | null | undefined, keys: string[]): number | null => {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const toSearchTokens = (value: string): string[] =>
  value
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);

const haversineMeters = (a: MapCoordinates, b: MapCoordinates) => {
  const toRadians = (input: number) => (input * Math.PI) / 180;
  const earthRadius = 6371000;
  const latDelta = toRadians(b.lat - a.lat);
  const lngDelta = toRadians(b.lng - a.lng);
  const originLat = toRadians(a.lat);
  const targetLat = toRadians(b.lat);
  const alpha =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(originLat) * Math.cos(targetLat) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);
  const gamma = 2 * Math.atan2(Math.sqrt(alpha), Math.sqrt(1 - alpha));
  return earthRadius * gamma;
};

const mapActivityTimeToWindow = (values: readonly string[]): TimeWindowKey | undefined => {
  if (!values.length) return undefined;
  const normalized = values.map((entry) => entry.trim().toLowerCase());
  if (normalized.some((entry) => entry.includes('early') || entry.includes('morning'))) {
    return 'morning';
  }
  if (normalized.some((entry) => entry.includes('afternoon'))) {
    return 'afternoon';
  }
  if (normalized.some((entry) => entry.includes('evening'))) {
    return 'evening';
  }
  if (normalized.some((entry) => entry.includes('night') || entry.includes('late'))) {
    return 'late';
  }
  return undefined;
};

const mapActivityPriceRangeToLevels = (range: ActivityFilterPreferences['priceRange']): number[] => {
  const [minDollars, maxDollars] = range;
  if (
    minDollars === DEFAULT_ACTIVITY_FILTER_PREFERENCES.priceRange[0] &&
    maxDollars === DEFAULT_ACTIVITY_FILTER_PREFERENCES.priceRange[1]
  ) {
    return [];
  }

  const minCents = Math.max(0, Math.round(minDollars * 100));
  const maxCents = maxDollars >= DEFAULT_ACTIVITY_FILTER_PREFERENCES.priceRange[1]
    ? Number.POSITIVE_INFINITY
    : Math.max(minCents, Math.round(maxDollars * 100));

  const levels: number[] = [];
  const bands = [
    { level: 1, min: 0, max: 2000 },
    { level: 2, min: 2001, max: 5000 },
    { level: 3, min: 5001, max: 10000 },
    { level: 4, min: 10001, max: Number.POSITIVE_INFINITY },
  ];

  bands.forEach((band) => {
    const overlaps = minCents <= band.max && maxCents >= band.min;
    if (overlaps) levels.push(band.level);
  });

  return levels;
};

const placeSearchScore = (place: PlaceSummary, searchText: string): number => {
  const trimmed = searchText.trim().toLowerCase();
  if (!trimmed) return 0;
  const haystack = [
    place.name,
    place.address ?? '',
    ...(place.categories ?? []),
    ...(place.tags ?? []),
  ]
    .join(' ')
    .toLowerCase();
  const name = place.name.trim().toLowerCase();
  if (name === trimmed) return 1.2;
  if (name.startsWith(trimmed)) return 0.9;
  if (haystack.includes(trimmed)) return 0.65;
  const tokens = toSearchTokens(trimmed);
  if (!tokens.length) return 0;
  const matchedTokens = tokens.filter((token) => haystack.includes(token)).length;
  return Math.min(0.5, matchedTokens * 0.15);
};

const placeDiscoveryScore = (
  place: PlaceSummary,
  options: { center: MapCoordinates; searchText?: string; nowMs?: number },
): number => {
  const metadata = (place.metadata ?? null) as Record<string, unknown> | null;
  const rankScore = readNumericMetadata(metadata, ['rankScore', 'rank_score']) ?? 0;
  const qualityConfidence = readNumericMetadata(metadata, ['qualityConfidence', 'quality_confidence']) ?? 0;
  const placeMatchConfidence = readNumericMetadata(metadata, ['placeMatchConfidence', 'place_match_confidence']) ?? 0;
  const popularityScore = typeof place.popularityScore === 'number' && Number.isFinite(place.popularityScore)
    ? Math.max(0, Math.min(place.popularityScore, 100)) / 100
    : 0;
  const ratingScore = place.rating != null && place.ratingCount
    ? Math.min(1.5, (place.rating * Math.log10(place.ratingCount + 1)) / 10)
    : 0;
  const distanceMeters = haversineMeters(options.center, { lat: place.lat, lng: place.lng });
  const distanceScore = Math.max(0, 1 - distanceMeters / 5000);
  const cachedAtMs = place.cachedAt
    ? new Date(place.cachedAt).getTime()
    : readTimestampMetadata(metadata, ['updatedAt', 'updated_at', 'lastSeenAt', 'last_seen_at']);
  const nowMs = options.nowMs ?? Date.now();
  const freshnessScore = cachedAtMs != null ? Math.max(0, 1 - (nowMs - cachedAtMs) / (21 * 24 * 60 * 60 * 1000)) : 0.35;
  const searchScore = placeSearchScore(place, options.searchText ?? '');
  const boundary = evaluateActivityFirstDiscoveryPolicy({
    name: place.name,
    description: place.description ?? null,
    categories: place.categories,
    tags: place.tags,
  });
  const activityEvidenceScore =
    (boundary.hasActivityCategoryEvidence ? 0.8 : 0) +
    (boundary.hasStructuredActivityEvidence ? 0.65 : 0) +
    (boundary.hasVenueActivityMapping ? 0.45 : 0) +
    (boundary.hasEventOrSessionEvidence ? 0.4 : 0) -
    (boundary.isHospitalityPrimary ? 0.8 : 0);

  return Number(
    (
      rankScore * 4
      + qualityConfidence * 1.5
      + placeMatchConfidence
      + searchScore * 2
      + distanceScore * 1.5
      + popularityScore
      + ratingScore
      + activityEvidenceScore
      + freshnessScore * 0.5
    ).toFixed(4),
  );
};

export const buildMobileMapDiscoveryFilters = (
  filters: MobileMapDiscoveryFiltersInput,
): DiscoveryFilterContract | undefined => {
  const searchText = typeof filters.searchText === 'string' ? filters.searchText.trim() : '';
  const taxonomyCategories = stripHospitalityFirstDiscoverySelections(normalizeStringArray(filters.categories));

  const next: DiscoveryFilterContract = {};
  if (searchText) next.searchText = searchText;
  if (taxonomyCategories.length) next.taxonomyCategories = taxonomyCategories;
  if (filters.maxDistanceKm != null && Number.isFinite(filters.maxDistanceKm) && filters.maxDistanceKm > 0) {
    next.maxDistanceKm = Number(filters.maxDistanceKm.toFixed(2));
  }
  if (filters.trustMode === 'verified_only' || filters.trustMode === 'ai_only') {
    next.trustMode = filters.trustMode;
  }
  return Object.keys(next).length ? next : undefined;
};

export const buildHomeDiscoveryFilters = (
  preferences: ActivityFilterPreferences | null | undefined,
): DiscoveryFilterContract | undefined => {
  const source = preferences ?? DEFAULT_ACTIVITY_FILTER_PREFERENCES;
  const taxonomyCategories = stripHospitalityFirstDiscoverySelections(normalizeStringArray(source.categories ?? []));
  const priceLevels = mapActivityPriceRangeToLevels(source.priceRange);
  const timeWindow = mapActivityTimeToWindow(source.timeOfDay ?? []);

  const next: DiscoveryFilterContract = {};
  if (taxonomyCategories.length) next.taxonomyCategories = taxonomyCategories;
  if (priceLevels.length) next.priceLevels = priceLevels;
  if (timeWindow) next.timeWindow = timeWindow;
  return Object.keys(next).length ? next : undefined;
};

export const discoveryFiltersEqual = (a?: DiscoveryFilterContract, b?: DiscoveryFilterContract): boolean =>
  discoveryFilterContractsEqual(a, b);

export const rankPlaceSummariesForDiscovery = (
  places: readonly PlaceSummary[],
  options: { center: MapCoordinates; searchText?: string; now?: Date },
): PlaceSummary[] => {
  const nowMs = options.now?.getTime();
  return [...places].sort((left, right) => {
    const scoreDelta = placeDiscoveryScore(right, {
      center: options.center,
      searchText: options.searchText,
      nowMs,
    }) - placeDiscoveryScore(left, {
      center: options.center,
      searchText: options.searchText,
      nowMs,
    });
    if (Math.abs(scoreDelta) > 1e-6) return scoreDelta;

    const leftDistance = haversineMeters(options.center, { lat: left.lat, lng: left.lng });
    const rightDistance = haversineMeters(options.center, { lat: right.lat, lng: right.lng });
    if (Math.abs(leftDistance - rightDistance) > 1) return leftDistance - rightDistance;

    return left.name.localeCompare(right.name);
  });
};
