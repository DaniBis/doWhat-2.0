import type { SupabaseClient } from '@supabase/supabase-js';

import { FOURSQUARE_TTL_MS, GOOGLE_TTL_MS } from '@/lib/venues/constants';
import type { ExternalVenueRecord } from '@/lib/venues/types';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

const FOURSQUARE_BASE_URL = 'https://api.foursquare.com/v3/places';
const GOOGLE_BASE_URL = 'https://places.googleapis.com/v1';

type CacheRow = {
  payload: ExternalVenueRecord;
  expires_at: string;
};

type CacheTable = 'foursquare_cache' | 'google_places_cache';

type CacheKey = 'fsq_id' | 'place_id';

type FoursquareCategory = { id?: number; name?: string | null };
type FoursquarePhoto = { prefix?: string | null; suffix?: string | null };
type FoursquareTip = { text?: string | null };
type FoursquareResponse = {
  name?: string | null;
  description?: string | null;
  categories?: FoursquareCategory[];
  tips?: FoursquareTip[];
  photos?: FoursquarePhoto[];
  location?: { address?: string | null; city?: string | null };
  geocodes?: { main?: { latitude?: number | null; longitude?: number | null } };
  rating?: number;
  price?: number;
};

type GooglePhotoAttribution = { photoUri?: string | null };
type GooglePhoto = { authorAttributions?: GooglePhotoAttribution[]; name?: string | null };
type GoogleReview = { text?: { text?: string | null } | null };
type GoogleDisplayName = { text?: string | null };
type GoogleResponse = {
  name?: string | null;
  displayName?: GoogleDisplayName | null;
  editorialSummary?: { text?: string | null } | null;
  shortFormattedAddress?: string | null;
  location?: { latitude?: number | null; longitude?: number | null } | null;
  rating?: number;
  priceLevel?: number;
  reviews?: GoogleReview[];
  types?: string[];
  photos?: GooglePhoto[];
};

async function readCache(
  supabase: SupabaseClient,
  table: CacheTable,
  keyColumn: CacheKey,
  key: string,
): Promise<ExternalVenueRecord | null> {
  const { data, error } = await supabase
    .from(table)
    .select<CacheRow>('payload, expires_at')
    .eq(keyColumn, key)
    .maybeSingle();

  if (error) {
    console.warn(`[cache] ${table} read failed`, error.message || error); // eslint-disable-line no-console
    return null;
  }

  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return null;
  }
  return data.payload;
}

async function writeCache(
  supabase: SupabaseClient,
  table: CacheTable,
  keyColumn: CacheKey,
  key: string,
  payload: ExternalVenueRecord,
  ttlMs: number,
  venueId?: string,
) {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const insertPayload: Record<string, unknown> = {
    [keyColumn]: key,
    venue_id: venueId ?? null,
    payload,
    fetched_at: new Date().toISOString(),
    expires_at: expiresAt,
  };
  const { error } = await supabase.from(table).upsert(insertPayload);
  if (error) {
    console.warn(`[cache] ${table} write failed`, error.message || error); // eslint-disable-line no-console
  }
}

function dedupeStrings(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values
    .flatMap((value) => (value ? value.split(',').map((v) => v.trim()) : []))
    .filter(Boolean)
    .forEach((value) => {
      const normalized = value.toLowerCase();
      if (seen.has(normalized)) return;
      seen.add(normalized);
      result.push(value);
    });
  return result;
}

export async function fetchFoursquareVenue(opts: {
  supabase: SupabaseClient;
  fsqId: string;
  venueId?: string;
  force?: boolean;
}): Promise<ExternalVenueRecord | null> {
  const { supabase, fsqId, venueId, force } = opts;
  if (!force) {
    const cached = await readCache(supabase, 'foursquare_cache', 'fsq_id', fsqId);
    if (cached) return cached;
  }

  const apiKey = process.env.FOURSQUARE_API_KEY;
  if (!apiKey) {
    throw new Error('FOURSQUARE_API_KEY is not configured.');
  }

  const fields = [
    'description',
    'categories',
    'geocodes',
    'location',
    'rating',
    'price',
    'website',
    'photos',
    'tips',
  ].join(',');

  const response = await fetch(`${FOURSQUARE_BASE_URL}/${fsqId}?fields=${fields}`, {
    headers: {
      accept: 'application/json',
      Authorization: apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Foursquare request failed (${response.status}): ${errorText}`);
  }

  const json = (await response.json()) as FoursquareResponse;
  const categories = Array.isArray(json.categories)
    ? json.categories
        .map((cat) => (typeof cat?.name === 'string' ? cat.name : null))
        .filter((value): value is string => Boolean(value))
    : [];
  const reviews = Array.isArray(json.tips)
    ? json.tips
        .map((tip) => (typeof tip?.text === 'string' ? tip.text : null))
        .filter((text): text is string => Boolean(text?.trim()))
        .slice(0, 10)
    : [];
  const photos = Array.isArray(json.photos)
    ? json.photos
        .map((photo) => {
          if (!photo?.prefix || !photo?.suffix) return null;
          return `${photo.prefix}original${photo.suffix}`;
        })
        .filter(Boolean)
        .slice(0, 5)
    : [];

  const normalized: ExternalVenueRecord = {
    provider: 'foursquare',
    providerId: fsqId,
    name: json.name,
    description: json.description ?? null,
    categories,
    keywords: dedupeStrings([json.location?.address, json.location?.city, ...categories]),
    rating: typeof json.rating === 'number' ? json.rating : null,
    priceLevel: typeof json.price === 'number' ? json.price : null,
    lat: json.geocodes?.main?.latitude ?? null,
    lng: json.geocodes?.main?.longitude ?? null,
    photos,
    reviews,
  };

  await writeCache(supabase, 'foursquare_cache', 'fsq_id', fsqId, normalized, FOURSQUARE_TTL_MS, venueId);
  return normalized;
}

export async function fetchGooglePlace(opts: {
  supabase: SupabaseClient;
  placeId: string;
  venueId?: string;
  force?: boolean;
}): Promise<ExternalVenueRecord | null> {
  const { supabase, placeId, venueId, force } = opts;
  if (!force) {
    const cached = await readCache(supabase, 'google_places_cache', 'place_id', placeId);
    if (cached) return cached;
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY is not configured.');
  }

  const fields = [
    'id',
    'displayName',
    'editorialSummary',
    'shortFormattedAddress',
    'location',
    'rating',
    'priceLevel',
    'reviews',
    'types',
    'photos',
  ].join(',');

  const response = await fetch(`${GOOGLE_BASE_URL}/places/${placeId}?languageCode=en&fields=${fields}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fields,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Google Places request failed (${response.status}): ${errorText}`);
  }

  const json = (await response.json()) as GoogleResponse;
  const categories = Array.isArray(json.types)
    ? json.types.map((type: string) => type.replace(/_/g, ' '))
    : [];
  const reviews = Array.isArray(json.reviews)
    ? json.reviews
        .map((review) => (typeof review?.text?.text === 'string' ? review.text.text : null))
        .filter((text): text is string => Boolean(text?.trim()))
        .slice(0, 10)
    : [];
  const photos = Array.isArray(json.photos)
    ? json.photos
        .map((photo) => photo?.authorAttributions?.[0]?.photoUri ?? photo?.name ?? null)
        .filter(Boolean)
        .slice(0, 5)
    : [];

  const normalized: ExternalVenueRecord = {
    provider: 'google',
    providerId: placeId,
    name: json.displayName?.text ?? json.name ?? 'Unknown venue',
    description: json.editorialSummary?.text ?? null,
    categories,
    keywords: dedupeStrings([json.shortFormattedAddress ?? null, ...categories]),
    rating: typeof json.rating === 'number' ? json.rating : null,
    priceLevel: typeof json.priceLevel === 'number' ? json.priceLevel : null,
    lat: json.location?.latitude ?? null,
    lng: json.location?.longitude ?? null,
    photos,
    reviews,
  };

  await writeCache(supabase, 'google_places_cache', 'place_id', placeId, normalized, GOOGLE_TTL_MS, venueId);
  return normalized;
}

export function mergeExternalVenues(records: ExternalVenueRecord[]): ExternalVenueRecord | null {
  if (!records.length) return null;
  const merged: ExternalVenueRecord = {
    provider: records[0].provider,
    providerId: records[0].providerId,
    name: records.find((r) => r.name)?.name ?? records[0].name,
    description: records.find((r) => r.description)?.description ?? records[0].description ?? null,
    categories: Array.from(new Set(records.flatMap((r) => r.categories))).filter(Boolean),
    keywords: Array.from(new Set(records.flatMap((r) => r.keywords))).filter(Boolean),
    rating:
      records.find((r) => typeof r.rating === 'number')?.rating ??
      (typeof records[0].rating === 'number' ? records[0].rating : null),
    priceLevel:
      records.find((r) => typeof r.priceLevel === 'number')?.priceLevel ??
      (typeof records[0].priceLevel === 'number' ? records[0].priceLevel : null),
    lat: records.find((r) => Number.isFinite(r.lat))?.lat ?? records[0].lat ?? null,
    lng: records.find((r) => Number.isFinite(r.lng))?.lng ?? records[0].lng ?? null,
    photos: Array.from(new Set(records.flatMap((r) => r.photos ?? []))).slice(0, 10),
    reviews: Array.from(new Set(records.flatMap((r) => r.reviews ?? []))).slice(0, 20),
  };

  return merged;
}

export function summarizeVenueText(record: ExternalVenueRecord | null): {
  rawDescription: string | null;
  rawReviews: string[];
} {
  if (!record) return { rawDescription: null, rawReviews: [] };
  const rawDescription = [record.description, ...record.keywords]
    .filter(Boolean)
    .join('\n');
  const rawReviews = record.reviews ?? [];
  return { rawDescription: rawDescription || null, rawReviews };
}

export function describeProviderError(provider: string, error: unknown) {
  return `[${provider}] ${getErrorMessage(error)}`;
}
