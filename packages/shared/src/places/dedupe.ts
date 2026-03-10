import type { PlaceSummary } from './types';

const DUPLICATE_PROXIMITY_METERS = 90;

const normalize = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const normalizeLabel = (place: Pick<PlaceSummary, 'name' | 'address'>): string =>
  normalize(place.name) || normalize(place.address);

const toMetadataRecord = (value: PlaceSummary['metadata']): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

const readStringFromMetadata = (metadata: Record<string, unknown> | null, keys: string[]): string | null => {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const unionStrings = (left?: string[] | null, right?: string[] | null): string[] => {
  const merged = new Set<string>();
  [...(left ?? []), ...(right ?? [])].forEach((value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed) merged.add(trimmed);
  });
  return Array.from(merged);
};

const unionAggregatedFrom = (left?: string[] | null, right?: string[] | null): string[] =>
  unionStrings(left, right);

const unionAttributions = (
  left?: PlaceSummary['attributions'],
  right?: PlaceSummary['attributions'],
): PlaceSummary['attributions'] => {
  const byProvider = new Map<string, PlaceSummary['attributions'][number]>();
  [...(left ?? []), ...(right ?? [])].forEach((entry) => {
    if (!entry || typeof entry.provider !== 'string' || !entry.provider.trim()) return;
    byProvider.set(entry.provider, entry);
  });
  return Array.from(byProvider.values());
};

const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const earthRadius = 6371000;
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
};

const extractCanonicalPlaceId = (place: PlaceSummary): string | null => {
  const metadata = toMetadataRecord(place.metadata);
  const metadataId = readStringFromMetadata(metadata, ['placeId', 'place_id']);
  if (metadataId) return metadataId;

  const aggregatedFrom = new Set(place.aggregatedFrom ?? []);
  if (aggregatedFrom.has('supabase-venues')) return null;
  if (aggregatedFrom.has('supabase-places')) {
    return place.id;
  }

  return null;
};

const extractVenueId = (place: PlaceSummary): string | null => {
  const metadata = toMetadataRecord(place.metadata);
  return readStringFromMetadata(metadata, [
    'linkedVenueId',
    'venueId',
    'venue_id',
    'supabaseVenueId',
    'supabase_venue_id',
    'matchedVenueId',
  ]);
};

const sourcePriority = (place: PlaceSummary): number => {
  const aggregatedFrom = new Set(place.aggregatedFrom ?? []);
  if (aggregatedFrom.has('supabase-places')) return 5;
  if (aggregatedFrom.has('foursquare')) return 4;
  if (aggregatedFrom.has('openstreetmap')) return 3;
  if (aggregatedFrom.has('google_places')) return 2;
  if (aggregatedFrom.has('supabase-venues')) return 1;
  return 0;
};

const qualityScore = (place: PlaceSummary): number => {
  let score = 0;
  if (extractCanonicalPlaceId(place)) score += 14;
  if (place.website) score += 4;
  score += sourcePriority(place) * 3;
  score += unionStrings(place.categories, null).length * 2;
  score += unionStrings(place.tags, null).length;
  if (typeof place.ratingCount === 'number' && Number.isFinite(place.ratingCount)) {
    score += Math.min(6, Math.log1p(Math.max(0, place.ratingCount)));
  }
  if (typeof place.popularityScore === 'number' && Number.isFinite(place.popularityScore)) {
    score += Math.min(4, Math.log1p(Math.max(0, place.popularityScore)));
  }
  return score;
};

const samePhysicalPlace = (left: PlaceSummary, right: PlaceSummary, proximityMeters: number): boolean => {
  const leftCanonicalId = extractCanonicalPlaceId(left);
  const rightCanonicalId = extractCanonicalPlaceId(right);
  if (leftCanonicalId && rightCanonicalId) {
    return leftCanonicalId === rightCanonicalId;
  }

  const leftLabel = normalizeLabel(left);
  const rightLabel = normalizeLabel(right);
  if (!leftLabel || !rightLabel || leftLabel !== rightLabel) return false;

  if (!Number.isFinite(left.lat) || !Number.isFinite(left.lng)) return false;
  if (!Number.isFinite(right.lat) || !Number.isFinite(right.lng)) return false;
  return haversineMeters(left.lat, left.lng, right.lat, right.lng) <= proximityMeters;
};

const mergePlaceMetadata = (preferred: PlaceSummary, duplicate: PlaceSummary): Record<string, unknown> | null => {
  const preferredMetadata = toMetadataRecord(preferred.metadata);
  const duplicateMetadata = toMetadataRecord(duplicate.metadata);
  const next: Record<string, unknown> = {
    ...(duplicateMetadata ?? {}),
    ...(preferredMetadata ?? {}),
  };

  const canonicalPlaceId = extractCanonicalPlaceId(preferred) ?? extractCanonicalPlaceId(duplicate);
  const linkedVenueId = extractVenueId(preferred) ?? extractVenueId(duplicate);

  if (canonicalPlaceId && typeof next.placeId !== 'string') {
    next.placeId = canonicalPlaceId;
  }
  if (linkedVenueId && typeof next.linkedVenueId !== 'string') {
    next.linkedVenueId = linkedVenueId;
  }

  return Object.keys(next).length ? next : null;
};

const mergePlaces = (preferred: PlaceSummary, duplicate: PlaceSummary): PlaceSummary => ({
  ...duplicate,
  ...preferred,
  id: extractCanonicalPlaceId(preferred) ?? extractCanonicalPlaceId(duplicate) ?? preferred.id,
  slug: preferred.slug ?? duplicate.slug ?? null,
  name: preferred.name || duplicate.name,
  categories: unionStrings(preferred.categories, duplicate.categories),
  tags: unionStrings(preferred.tags, duplicate.tags),
  address: preferred.address ?? duplicate.address ?? null,
  city: preferred.city ?? duplicate.city ?? null,
  locality: preferred.locality ?? duplicate.locality ?? null,
  region: preferred.region ?? duplicate.region ?? null,
  country: preferred.country ?? duplicate.country ?? null,
  postcode: preferred.postcode ?? duplicate.postcode ?? null,
  phone: preferred.phone ?? duplicate.phone ?? null,
  website: preferred.website ?? duplicate.website ?? null,
  description: preferred.description ?? duplicate.description ?? null,
  fsqId: preferred.fsqId ?? duplicate.fsqId ?? null,
  rating: preferred.rating ?? duplicate.rating ?? null,
  ratingCount: preferred.ratingCount ?? duplicate.ratingCount ?? null,
  priceLevel: preferred.priceLevel ?? duplicate.priceLevel ?? null,
  popularityScore: preferred.popularityScore ?? duplicate.popularityScore ?? null,
  aggregatedFrom: unionAggregatedFrom(preferred.aggregatedFrom, duplicate.aggregatedFrom),
  primarySource: preferred.primarySource ?? duplicate.primarySource ?? null,
  cacheExpiresAt: preferred.cacheExpiresAt ?? duplicate.cacheExpiresAt,
  cachedAt: preferred.cachedAt ?? duplicate.cachedAt,
  attributions: unionAttributions(preferred.attributions, duplicate.attributions),
  metadata: mergePlaceMetadata(preferred, duplicate),
  transient: preferred.transient ?? duplicate.transient ?? false,
});

export const dedupePlaceSummaries = <T extends PlaceSummary>(
  places: T[],
  proximityMeters = DUPLICATE_PROXIMITY_METERS,
): T[] => {
  if (places.length < 2) return places;

  const result: T[] = [];

  places.forEach((candidate) => {
    const index = result.findIndex((existing) => samePhysicalPlace(existing, candidate, proximityMeters));
    if (index < 0) {
      result.push(candidate);
      return;
    }

    const existing = result[index];
    const preferred = qualityScore(candidate) > qualityScore(existing) ? candidate : existing;
    const duplicate = preferred === candidate ? existing : candidate;
    result[index] = mergePlaces(preferred, duplicate) as T;
  });

  return result;
};
