import type { SupabaseClient } from '@supabase/supabase-js';

import { PLACE_FALLBACK_LABEL } from '@/lib/places/labels';
import { haversineMeters } from '@/lib/places/utils';
import { createServiceClient } from '@/lib/supabase/service';

const NOMINATIM_ENDPOINT = process.env.NOMINATIM_REVERSE_URL ?? 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT ?? 'doWhat/2.0 (+https://dowhat.app)';
const OVERPASS_ENDPOINT = process.env.OVERPASS_API_URL ?? 'https://overpass-api.de/api/interpreter';
const MAPBOX_TOKEN =
  process.env.MAPBOX_TOKEN
  ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
const MAPBOX_ENDPOINT = process.env.MAPBOX_REVERSE_URL ?? 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const RATE_LIMIT_WINDOW_MS = 1_200;
const RESOLUTION_TIMEOUT_MS = 6_000;
const COORD_HASH_PRECISION = 4;
const CACHE_DISTANCE_METERS = 120;
const BBOX_TOLERANCE_DEGREES = 0.0015;

const providerLocks = new Map<string, number>();

type PlaceResolutionSource = 'cache' | 'mapbox' | 'nominatim' | 'overpass' | 'placeholder';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export interface ActivityPlaceSummary {
  id: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  categories: string[] | null;
}

export interface ResolvedPlace {
  placeId: string;
  label: string;
  source: PlaceResolutionSource;
  place: ActivityPlaceSummary;
}

export interface ResolvePlaceOptions {
  lat: number;
  lng: number;
  labelHint?: string | null;
  source?: string;
  categories?: string[] | null;
  cacheOnly?: boolean;
}

interface PlaceRow extends ActivityPlaceSummary {
  metadata: Record<string, unknown> | null;
}

interface PlaceCandidate {
  name: string | null;
  address: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  categories: string[];
  tags: string[];
  provider: 'mapbox' | 'openstreetmap' | 'placeholder';
  source: PlaceResolutionSource;
  confidence: number;
}

export const resolvePlaceFromCoords = async (options: ResolvePlaceOptions): Promise<ResolvedPlace> => {
  const client = createServiceClient();
  return resolvePlaceFromCoordsWithClient(client, options);
};

export const resolvePlaceFromCoordsWithClient = async (
  client: SupabaseClient,
  options: ResolvePlaceOptions,
): Promise<ResolvedPlace> => {
  const lat = normalizeCoordinate(options.lat);
  const lng = normalizeCoordinate(options.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Latitude and longitude are required to resolve a place.');
  }

  const labelHint = sanitizeLabel(options.labelHint) ?? PLACE_FALLBACK_LABEL;
  const coordHash = buildCoordHash(lat, lng);
  const cached = await findCachedPlace(client, lat, lng, coordHash);
  if (cached) {
    const label = sanitizeLabel(cached.name) ?? labelHint;
    return {
      placeId: cached.id,
      label,
      source: 'cache',
      place: simplifyPlaceRow(cached),
    };
  }

  if (options.cacheOnly) {
    return {
      placeId: await ensurePlaceholderPlace(client, lat, lng, labelHint, coordHash),
      label: labelHint,
      source: 'placeholder',
      place: {
        id: '',
        name: labelHint,
        lat,
        lng,
        address: null,
        locality: null,
        region: null,
        country: null,
        categories: null,
      },
    };
  }

  const candidate =
    (await resolveViaMapbox(lat, lng, labelHint))
    ?? (await resolveViaNominatim(lat, lng, labelHint))
    ?? (await resolveViaOverpass(lat, lng, labelHint))
    ?? {
      name: labelHint,
      address: null,
      locality: null,
      region: null,
      country: null,
      categories: [],
      tags: [],
      provider: 'placeholder',
      source: 'placeholder',
      confidence: 0.1,
    };

  const label = sanitizeLabel(candidate.name) ?? labelHint;
  const insertPayload = {
    name: label,
    lat,
    lng,
    categories: candidate.categories,
    tags: candidate.tags,
    address: candidate.address,
    locality: candidate.locality,
    region: candidate.region,
    country: candidate.country,
    metadata: {
      coord_hash: coordHash,
      resolver: {
        provider: candidate.provider,
        source: options.source ?? candidate.source,
        confidence: candidate.confidence,
        resolved_at: new Date().toISOString(),
      },
    },
  };

  const { data, error } = await client
    .from('places')
    .insert(insertPayload)
    .select('id,name,lat,lng,address,locality,region,country,categories,metadata')
    .single<PlaceRow>();
  if (error || !data) {
    throw new Error(`Failed to persist resolved place: ${error?.message ?? 'unknown error'}`);
  }

  return {
    placeId: data.id,
    label,
    source: candidate.source,
    place: simplifyPlaceRow(data),
  };
};

const normalizeCoordinate = (value: number): number => Number(value.toFixed(6));

const sanitizeLabel = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s+/g, ' ');
  if (isGenericLabel(normalized)) return null;
  return normalized;
};

const isGenericLabel = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return ['location to be confirmed', 'unknown location', 'unnamed place', 'unnamed road', 'unnamed spot'].some((keyword) =>
    normalized.includes(keyword),
  );
};

const buildCoordHash = (lat: number, lng: number) => {
  const latPart = lat.toFixed(COORD_HASH_PRECISION);
  const lngPart = lng.toFixed(COORD_HASH_PRECISION);
  return `${latPart},${lngPart}`;
};

const findCachedPlace = async (client: SupabaseClient, lat: number, lng: number, coordHash: string) => {
  const selection = 'id,name,lat,lng,address,locality,region,country,categories,metadata';
  const { data: hashMatch } = await client
    .from('places')
    .select(selection)
    .filter('metadata->>coord_hash', 'eq', coordHash)
    .limit(1)
    .maybeSingle<PlaceRow>();
  if (hashMatch) {
    return hashMatch;
  }

  const { data } = await client
    .from('places')
    .select(selection)
    .gte('lat', lat - BBOX_TOLERANCE_DEGREES)
    .lte('lat', lat + BBOX_TOLERANCE_DEGREES)
    .gte('lng', lng - BBOX_TOLERANCE_DEGREES)
    .lte('lng', lng + BBOX_TOLERANCE_DEGREES)
    .limit(50)
    .returns<PlaceRow[]>();

  if (!data?.length) return null;
  const scored = data
    .map((row) => ({ row, distance: haversineMeters(lat, lng, row.lat ?? lat, row.lng ?? lng) }))
    .filter((entry) => Number.isFinite(entry.distance))
    .sort((a, b) => a.distance - b.distance);
  const best = scored[0];
  if (!best || best.distance > CACHE_DISTANCE_METERS) {
    return null;
  }
  return best.row;
};

const simplifyPlaceRow = (row: PlaceRow): ActivityPlaceSummary => ({
  id: row.id,
  name: row.name,
  lat: row.lat,
  lng: row.lng,
  address: row.address,
  locality: row.locality,
  region: row.region,
  country: row.country,
  categories: row.categories ?? null,
});

const rateLimit = async (key: string) => {
  const now = Date.now();
  const last = providerLocks.get(key) ?? 0;
  const waitMs = RATE_LIMIT_WINDOW_MS - (now - last);
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  providerLocks.set(key, Date.now());
};

const withTimeout = async <T>(promise: Promise<T>): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESOLUTION_TIMEOUT_MS);
  try {
    const result = await promise;
    clearTimeout(timeout);
    return result;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
};

const extractMapboxContext = (feature: Record<string, unknown>, prefix: string): string | null => {
  const contextValue = feature.context;
  const context = Array.isArray(contextValue) ? contextValue : [];
  for (const entry of context) {
    if (!isRecord(entry)) continue;
    const id = entry.id;
    if (typeof id === 'string' && id.startsWith(`${prefix}.`)) {
      const text = typeof entry.text === 'string' ? entry.text.trim() : '';
      return text || null;
    }
  }
  return null;
};

const resolveViaMapbox = async (
  lat: number,
  lng: number,
  labelHint: string,
): Promise<PlaceCandidate | null> => {
  if (!MAPBOX_TOKEN) return null;
  try {
    await rateLimit('mapbox');
    const url = new URL(`${MAPBOX_ENDPOINT}/${lng},${lat}.json`);
    url.searchParams.set('access_token', MAPBOX_TOKEN);
    url.searchParams.set('limit', '1');
    url.searchParams.set('types', 'poi,address,neighborhood,locality,place');

    const response = await withTimeout(fetch(url.toString()));
    if (!response.ok) {
      throw new Error(`Mapbox request failed (${response.status})`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const features = Array.isArray(payload.features) ? payload.features : [];
    const feature = features[0];
    if (!isRecord(feature)) return null;

    const name =
      sanitizeLabel(typeof feature.text === 'string' ? feature.text : null)
      ?? sanitizeLabel(typeof feature.place_name === 'string' ? feature.place_name : null)
      ?? labelHint;
    const locality = extractMapboxContext(feature, 'place') ?? extractMapboxContext(feature, 'locality');
    const region = extractMapboxContext(feature, 'region');
    const country = extractMapboxContext(feature, 'country');
    const address = typeof feature.place_name === 'string' ? feature.place_name : null;

    return {
      name,
      address,
      locality,
      region,
      country,
      categories: [],
      tags: [],
      provider: 'mapbox',
      source: 'mapbox',
      confidence: 0.9,
    };
  } catch (error) {
    console.warn('[places] reverse geocode (mapbox) failed', error);
    return null;
  }
};

const resolveViaNominatim = async (
  lat: number,
  lng: number,
  labelHint: string,
): Promise<PlaceCandidate | null> => {
  try {
    await rateLimit('nominatim');
    const url = new URL(NOMINATIM_ENDPOINT);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', lat.toString());
    url.searchParams.set('lon', lng.toString());
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');
    const response = await withTimeout(
      fetch(url.toString(), {
        headers: {
          'User-Agent': NOMINATIM_USER_AGENT,
        },
      }),
    );

    if (!response.ok) {
      throw new Error(`Nominatim request failed (${response.status})`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const address = isRecord(payload.address) ? payload.address : {};
    const name =
      sanitizeLabel(typeof payload.name === 'string' ? payload.name : null)
      ?? sanitizeLabel(typeof payload.display_name === 'string' ? payload.display_name : null)
      ?? labelHint;
    return {
      name,
      address: buildAddressFromComponents(address),
      locality:
        sanitizeLabel(typeof address.city === 'string' ? address.city : null)
        ?? sanitizeLabel(typeof address.town === 'string' ? address.town : null)
        ?? sanitizeLabel(typeof address.village === 'string' ? address.village : null)
        ?? sanitizeLabel(typeof address.state_district === 'string' ? address.state_district : null)
        ?? null,
      region:
        sanitizeLabel(typeof address.state === 'string' ? address.state : null)
        ?? sanitizeLabel(typeof address.region === 'string' ? address.region : null)
        ?? null,
      country: sanitizeLabel(typeof address.country === 'string' ? address.country : null),
      categories: extractCategoriesFromAddress(address),
      tags: extractTagsFromAddress(address),
      provider: 'openstreetmap',
      source: 'nominatim',
      confidence: 0.8,
    };
  } catch (error) {
    console.warn('[places] reverse geocode (nominatim) failed', error);
    return null;
  }
};

const resolveViaOverpass = async (
  lat: number,
  lng: number,
  labelHint: string,
): Promise<PlaceCandidate | null> => {
  try {
    await rateLimit('overpass');
    const radius = 250;
    const overpassQuery = `
[out:json][timeout:25];
(
  node(around:${radius},${lat},${lng})["name"];
  way(around:${radius},${lat},${lng})["name"];
  relation(around:${radius},${lat},${lng})["name"];
);
out center 15;`;

    const response = await withTimeout(
      fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: new URLSearchParams({ data: overpassQuery }).toString(),
      }),
    );

    if (!response.ok) {
      throw new Error(`Overpass request failed (${response.status})`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const elements = Array.isArray(payload.elements) ? payload.elements : [];
    for (const element of elements) {
      if (!isRecord(element)) continue;
      const tags = isRecord(element.tags) ? element.tags : {};
      const candidateName =
        sanitizeLabel(typeof tags.name === 'string' ? tags.name : null)
        ?? labelHint;
      const address = buildAddressFromComponents(tags);
      if (!candidateName) continue;
      return {
        name: candidateName,
        address,
        locality:
          sanitizeLabel(typeof tags['addr:city'] === 'string' ? tags['addr:city'] : null)
          ?? sanitizeLabel(typeof tags['addr:town'] === 'string' ? tags['addr:town'] : null)
          ?? sanitizeLabel(typeof tags['addr:village'] === 'string' ? tags['addr:village'] : null)
          ?? null,
        region:
          sanitizeLabel(typeof tags['addr:state'] === 'string' ? tags['addr:state'] : null)
          ?? sanitizeLabel(typeof tags['is_in:state'] === 'string' ? tags['is_in:state'] : null)
          ?? null,
        country: sanitizeLabel(typeof tags['addr:country'] === 'string' ? tags['addr:country'] : null),
        categories: extractCategoriesFromTags(tags),
        tags: extractTagsFromTags(tags),
        provider: 'openstreetmap',
        source: 'overpass',
        confidence: 0.6,
      };
    }
  } catch (error) {
    console.warn('[places] reverse geocode (overpass) failed', error);
  }
  return null;
};

const buildAddressFromComponents = (components: Record<string, unknown>): string | null => {
  const parts = [
    components['addr:housenumber'],
    components['addr:street'],
    components['addr:neighbourhood'],
    components['addr:suburb'],
    components['addr:city'],
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  return parts.length ? parts.join(', ') : null;
};

const extractCategoriesFromAddress = (address: Record<string, unknown>): string[] => {
  const fields = ['leisure', 'amenity', 'sport'];
  const values = fields
    .map((field) => address[field])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return Array.from(new Set(values.map((value) => value.toLowerCase())));
};

const extractCategoriesFromTags = (tags: Record<string, unknown>): string[] => {
  const fields = ['sport', 'leisure', 'amenity'];
  const values = fields
    .map((field) => tags[field])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return Array.from(new Set(values.map((value) => value.toLowerCase())));
};

const extractTagsFromAddress = (address: Record<string, unknown>): string[] => {
  const fields = ['sport', 'club'];
  const values = fields
    .map((field) => address[field])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return Array.from(new Set(values.map((value) => value.toLowerCase())));
};

const extractTagsFromTags = (tags: Record<string, unknown>): string[] => {
  const interesting = ['sport', 'club', 'cuisine'];
  const values = interesting
    .map((key) => tags[key])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .flatMap((value) => value.split(/;|,/).map((entry) => entry.trim().toLowerCase()))
    .filter(Boolean);
  return Array.from(new Set(values));
};

const ensurePlaceholderPlace = async (
  client: SupabaseClient,
  lat: number,
  lng: number,
  label: string,
  coordHash: string,
): Promise<string> => {
  const { data, error } = await client
    .from('places')
    .insert({
      name: label,
      lat,
      lng,
      categories: [],
      tags: [],
      metadata: {
        coord_hash: coordHash,
        resolver: {
          provider: 'placeholder',
          source: 'cache-only',
          resolved_at: new Date().toISOString(),
        },
      },
    })
    .select('id')
    .single<{ id: string }>();
  if (error || !data) {
    throw new Error(`Failed to insert placeholder place: ${error?.message ?? 'unknown error'}`);
  }
  return data.id;
};
