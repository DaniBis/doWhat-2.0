import { supabase } from './supabase';
import type { PlaceSummary, PlacesViewportQuery } from '@dowhat/shared';

const SUPABASE_DEFAULT_LIMIT = 60;

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
  const { data, error } = await supabase
    .from('venues')
    .select('id,name,address,lat,lng,ai_activity_tags,verified_activities,updated_at')
    .gte('lat', bounds.sw.lat)
    .lte('lat', bounds.ne.lat)
    .gte('lng', bounds.sw.lng)
    .lte('lng', bounds.ne.lng)
    .order('updated_at', { ascending: false })
    .limit(queryLimit);

  if (error) throw error;

  const deduped = new Map<string, PlaceSummary>();
  ((data as SupabasePlacesRow[] | null) ?? []).forEach((row) => {
    const summary = mapVenueRowToPlaceSummary(row, citySlug);
    if (!summary) return;
    if (!deduped.has(summary.id)) {
      deduped.set(summary.id, summary);
    }
  });

  return Array.from(deduped.values());
};
