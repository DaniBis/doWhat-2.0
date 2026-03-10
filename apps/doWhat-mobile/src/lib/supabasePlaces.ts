import { isMissingColumnError } from './supabaseErrors';
import { supabase } from './supabase';
import {
  dedupePlaceSummaries,
  filterPlaceSummariesByDiscoveryFilters,
  type PlaceSummary,
  type PlacesViewportQuery,
} from '@dowhat/shared';

const SUPABASE_DEFAULT_LIMIT = 60;
let loggedMissingUpdatedAtWarning = false;

const BLOCKED_LABELS = new Set([
  'activity',
  'activities',
  'anywhere',
  'everywhere',
  'nearbyplace',
  'nearbyplaces',
  'nearbyvenue',
  'nearbyvenues',
  'n/a',
  'na',
  'none',
  'null',
  'placeholder',
  'place',
  'sample',
  'test',
  'unknown',
  'unnamed',
  'venue',
]);

const normalizeLabelKey = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9/]+/g, '');

const isHighQualityLabel = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 90) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (/(.)\1{4,}/i.test(trimmed)) return false;
  if (/\b(test|dummy|sample|placeholder)\b/i.test(trimmed)) return false;

  const key = normalizeLabelKey(trimmed);
  if (!key || BLOCKED_LABELS.has(key)) return false;

  const letters = (trimmed.match(/[a-z]/gi) ?? []).length;
  if (letters < 3) return false;
  return true;
};

export type SupabasePlacesRow = {
  id: string | null;
  name: string | null;
  address: string | null;
  lat: number | string | null;
  lng: number | string | null;
  website?: string | null;
  verified_activities: string[] | null;
  ai_activity_tags: string[] | null;
  updated_at?: string | null;
};

export type SupabaseCanonicalPlaceRow = {
  id: string | null;
  name: string | null;
  address: string | null;
  lat: number | string | null;
  lng: number | string | null;
  website?: string | null;
  categories: string[] | null;
  locality?: string | null;
  region?: string | null;
  country?: string | null;
  updated_at?: string | null;
};

const sanitizeCoordinate = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry): entry is string => Boolean(entry));
};

const mapVenueRowToPlaceSummary = (
  row: SupabasePlacesRow,
  fallbackCitySlug: string,
): PlaceSummary | null => {
  if (!row?.id) return null;
  const lat = sanitizeCoordinate(row.lat);
  const lng = sanitizeCoordinate(row.lng);
  if (lat == null || lng == null) return null;
  if (!isHighQualityLabel(row.name)) return null;
  const name = row.name.trim();
  return {
    id: row.id,
    slug: null,
    name,
    lat,
    lng,
    categories: toStringArray(row.verified_activities),
    tags: toStringArray(row.ai_activity_tags),
    address: row.address ?? null,
    website: row.website ?? null,
    city: fallbackCitySlug,
    locality: null,
    region: null,
    country: null,
    postcode: null,
    aggregatedFrom: ['supabase-venues'],
    attributions: [],
    metadata: {
      fallbackSource: 'supabase',
      venueId: row.id,
      updatedAt: row.updated_at ?? null,
    },
    transient: true,
  };
};

const mapCanonicalPlaceRowToPlaceSummary = (
  row: SupabaseCanonicalPlaceRow,
  fallbackCitySlug: string,
): PlaceSummary | null => {
  if (!row?.id) return null;
  const lat = sanitizeCoordinate(row.lat);
  const lng = sanitizeCoordinate(row.lng);
  if (lat == null || lng == null) return null;
  if (!isHighQualityLabel(row.name)) return null;
  const name = row.name.trim();
  const categories = toStringArray(row.categories);
  return {
    id: row.id,
    slug: null,
    name,
    lat,
    lng,
    categories,
    tags: categories,
    address: row.address ?? null,
    website: row.website ?? null,
    city: fallbackCitySlug,
    locality: row.locality ?? null,
    region: row.region ?? null,
    country: row.country ?? null,
    postcode: null,
    aggregatedFrom: ['supabase-places'],
    attributions: [],
    metadata: {
      fallbackSource: 'supabase-places',
      placeId: row.id,
      updatedAt: row.updated_at ?? null,
    },
    transient: true,
  };
};

export interface FetchSupabasePlacesOptions {
  bounds: PlacesViewportQuery['bounds'];
  citySlug: string;
  limit?: number;
  discoveryFilters?: PlacesViewportQuery['discoveryFilters'];
}

export const fetchSupabasePlacesWithinBounds = async (
  options: FetchSupabasePlacesOptions,
): Promise<PlaceSummary[]> => {
  const { bounds, citySlug, limit, discoveryFilters } = options;
  const queryLimit = Math.max(1, Math.min(limit ?? SUPABASE_DEFAULT_LIMIT, 400));
  let includeWebsite = true;
  const buildQuery = (includeUpdatedAt: boolean) => {
    let query = supabase
      .from('venues')
      .select(
        includeUpdatedAt
          ? `id,name,address,lat,lng${includeWebsite ? ',website' : ''},ai_activity_tags,verified_activities,updated_at`
          : `id,name,address,lat,lng${includeWebsite ? ',website' : ''},ai_activity_tags,verified_activities`,
      )
      .gte('lat', bounds.sw.lat)
      .lte('lat', bounds.ne.lat)
      .gte('lng', bounds.sw.lng)
      .lte('lng', bounds.ne.lng);

    if (includeUpdatedAt) {
      query = query.order('updated_at', { ascending: false });
    }

    return query.limit(queryLimit);
  };

  let includeUpdatedAt = true;
  let rows: SupabasePlacesRow[] | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await buildQuery(includeUpdatedAt);
    if (!error) {
      rows = Array.isArray(data) ? (data as unknown as SupabasePlacesRow[]) : null;
      break;
    }

    if (includeWebsite && isMissingColumnError(error, 'website')) {
      includeWebsite = false;
      continue;
    }
    if (includeUpdatedAt && isMissingColumnError(error, 'updated_at')) {
      includeUpdatedAt = false;
      // eslint-disable-next-line no-console
      if (!loggedMissingUpdatedAtWarning) {
        // eslint-disable-next-line no-console
        console.info('[supabase-places] missing updated_at column, retrying without recency ordering');
        loggedMissingUpdatedAtWarning = true;
      }
      continue;
    }

    throw error;
  }

  const venueDataset = rows ?? [];

  let placeDataset: SupabaseCanonicalPlaceRow[] = [];
  try {
    let includePlacesWebsite = true;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data: canonicalPlaces, error: placesError } = await supabase
        .from('places')
        .select(
          `id,name,address,lat,lng${includePlacesWebsite ? ',website' : ''},categories,locality,region,country,updated_at`,
        )
        .gte('lat', bounds.sw.lat)
        .lte('lat', bounds.ne.lat)
        .gte('lng', bounds.sw.lng)
        .lte('lng', bounds.ne.lng)
        .order('updated_at', { ascending: false })
        .limit(queryLimit);

      if (!placesError) {
        if (Array.isArray(canonicalPlaces)) {
          placeDataset = canonicalPlaces as unknown as SupabaseCanonicalPlaceRow[];
        }
        break;
      }

      if (includePlacesWebsite && isMissingColumnError(placesError, 'website')) {
        includePlacesWebsite = false;
        continue;
      }
      break;
    }
  } catch {
    // Ignore places table access failures and keep venue-based results.
  }

  const summaries = [
    ...venueDataset
      .map((row) => mapVenueRowToPlaceSummary(row, citySlug))
      .filter((summary): summary is PlaceSummary => Boolean(summary)),
    ...placeDataset
      .map((row) => mapCanonicalPlaceRowToPlaceSummary(row, citySlug))
      .filter((summary): summary is PlaceSummary => Boolean(summary)),
  ];

  return filterPlaceSummariesByDiscoveryFilters(
    dedupePlaceSummaries(summaries).slice(0, queryLimit),
    discoveryFilters,
    {
      center: {
        lat: (bounds.sw.lat + bounds.ne.lat) / 2,
        lng: (bounds.sw.lng + bounds.ne.lng) / 2,
      },
      now: new Date(),
      citySlug,
    },
  );
};
