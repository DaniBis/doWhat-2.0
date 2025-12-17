import { fetchWithTimeout } from './fetchWithTimeout';

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const GEOCODE_USER_AGENT = 'doWhat/1.0 (mobile@dowhat.app)';
const DEFAULT_TIMEOUT_MS = 8000;

const sanitizeCoordinate = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const resolveLabel = (entry: NominatimSearchEntry): string | null => {
  if (entry.display_name && entry.display_name.trim()) {
    const primary = entry.display_name.split(',')[0]?.trim();
    if (primary) return primary;
  }
  if (entry.name && entry.name.trim()) {
    return entry.name.trim();
  }
  return null;
};

type NominatimSearchEntry = {
  display_name?: string;
  name?: string;
  lat?: string | number;
  lon?: string | number;
  addresstype?: string;
  address?: Record<string, string | null | undefined>;
};

export type GeocodeResult = {
  label: string;
  description: string | null;
  lat: number;
  lng: number;
};

export interface GeocodeSearchOptions {
  limit?: number;
  nearLat?: number;
  nearLng?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type ReverseGeocodeResult = {
  label: string;
  description: string | null;
};

export interface ReverseGeocodeOptions {
  zoom?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  locale?: string;
}

const clampLimit = (limit: number | undefined, fallback: number) =>
  Math.max(1, Math.min(limit ?? fallback, 10));

const buildDescription = (entry: NominatimSearchEntry): string | null => {
  if (typeof entry.display_name === 'string' && entry.display_name.trim()) {
    return entry.display_name.trim();
  }
  const addressValues = entry.address ? Object.values(entry.address).filter((value): value is string => Boolean(value && value.trim())) : [];
  if (addressValues.length) {
    return addressValues.join(', ');
  }
  return null;
};

export const searchGeocode = async (
  query: string,
  options?: GeocodeSearchOptions,
): Promise<GeocodeResult[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const limit = clampLimit(options?.limit, 5);
  const url = new URL(`${NOMINATIM_BASE_URL}/search`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('accept-language', 'en');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('q', trimmed);
  url.searchParams.set('addressdetails', '1');
  if (
    typeof options?.nearLat === 'number' && Number.isFinite(options.nearLat) &&
    typeof options.nearLng === 'number' && Number.isFinite(options.nearLng)
  ) {
    url.searchParams.set('lat', options.nearLat.toFixed(6));
    url.searchParams.set('lon', options.nearLng.toFixed(6));
  }

  const response = await fetchWithTimeout(url.toString(), {
    timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    signal: options?.signal,
    headers: {
      'User-Agent': GEOCODE_USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Geocode request failed (${response.status})`);
  }

  const payload = (await response.json()) as NominatimSearchEntry[];
  return (payload ?? [])
    .map((entry) => {
      const latValue = sanitizeCoordinate(entry.lat);
      const lngValue = sanitizeCoordinate(entry.lon);
      if (latValue == null || lngValue == null) return null;
      const label = resolveLabel(entry);
      const description = buildDescription(entry);
      return label
        ? ({
            label,
            description,
            lat: latValue,
            lng: lngValue,
          } satisfies GeocodeResult)
        : null;
    })
    .filter((entry): entry is GeocodeResult => Boolean(entry));
};

export const geocodeLabelToCoords = async (
  label: string,
  options?: Omit<GeocodeSearchOptions, 'limit'>,
): Promise<{ lat: number; lng: number } | null> => {
  const results = await searchGeocode(label, { ...options, limit: 1 });
  if (!results.length) return null;
  return { lat: results[0].lat, lng: results[0].lng };
};

const buildReverseLabel = (
  payload: { address?: Record<string, string | null | undefined>; display_name?: string },
  fallback: string,
): ReverseGeocodeResult => {
  const address = payload.address ?? {};
  const locality = address.city || address.town || address.village || address.hamlet || null;
  const parts = [locality, address.state, address.country]
    .filter((value): value is string => Boolean(value && value.trim()))
    .slice(0, 3);
  const description = typeof payload.display_name === 'string' && payload.display_name.trim()
    ? payload.display_name.trim()
    : null;
  const label = parts.length ? parts.join(', ') : description ?? fallback;
  return { label, description };
};

export const reverseGeocodeCoords = async (
  lat: number,
  lng: number,
  options?: ReverseGeocodeOptions,
): Promise<ReverseGeocodeResult | null> => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const zoom = Math.min(Math.max(Math.trunc(options?.zoom ?? 10), 3), 18);
  const url = new URL(`${NOMINATIM_BASE_URL}/reverse`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', lat.toFixed(6));
  url.searchParams.set('lon', lng.toFixed(6));
  url.searchParams.set('zoom', String(zoom));
  url.searchParams.set('addressdetails', '1');
  if (options?.locale) {
    url.searchParams.set('accept-language', options.locale);
  }

  const response = await fetchWithTimeout(url.toString(), {
    timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    signal: options?.signal,
    headers: {
      'User-Agent': GEOCODE_USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Reverse geocode failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    address?: Record<string, string | null | undefined>;
    display_name?: string;
  };
  return buildReverseLabel(payload ?? {}, `${lat.toFixed(3)}, ${lng.toFixed(3)}`);
};
