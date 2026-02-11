import { isMissingColumnError } from './supabaseErrors';
import { supabase } from './supabase';
import type { PlaceSummary, PlacesViewportQuery } from '@dowhat/shared';

const SUPABASE_DEFAULT_LIMIT = 60;
let loggedMissingUpdatedAtWarning = false;

export type SupabasePlacesRow = {
  id: string | null;
  name: string | null;
  address: string | null;
  lat: number | string | null;
  lng: number | string | null;
  verified_activities: string[] | null;
  ai_activity_tags: string[] | null;
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
  const name = typeof row.name === 'string' && row.name.trim() ? row.name : 'Nearby venue';
  return {
    id: row.id,
    slug: null,
    name,
    lat,
    lng,
    categories: toStringArray(row.verified_activities),
    tags: toStringArray(row.ai_activity_tags),
    address: row.address ?? null,
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

export interface FetchSupabasePlacesOptions {
  bounds: PlacesViewportQuery['bounds'];
  citySlug: string;
  limit?: number;
}

export const fetchSupabasePlacesWithinBounds = async (
  options: FetchSupabasePlacesOptions,
): Promise<PlaceSummary[]> => {
  const { bounds, citySlug, limit } = options;
  const queryLimit = Math.max(1, Math.min(limit ?? SUPABASE_DEFAULT_LIMIT, 400));
  const buildQuery = (includeUpdatedAt: boolean) => {
    let query = supabase
      .from('venues')
      .select(
        includeUpdatedAt
          ? 'id,name,address,lat,lng,ai_activity_tags,verified_activities,updated_at'
          : 'id,name,address,lat,lng,ai_activity_tags,verified_activities',
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

  const dataset = rows ?? [];

  const deduped = new Map<string, PlaceSummary>();
  dataset.forEach((row) => {
    const summary = mapVenueRowToPlaceSummary(row, citySlug);
    if (!summary) return;
    if (!deduped.has(summary.id)) {
      deduped.set(summary.id, summary);
    }
  });

  return Array.from(deduped.values());
};
