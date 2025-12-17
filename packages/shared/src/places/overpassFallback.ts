import type { PlaceAttribution, PlaceSummary, PlacesViewportQuery } from './types';

const RAW_OVERPASS_ENDPOINT =
  typeof process !== 'undefined' && process.env?.OVERPASS_API_URL
    ? process.env.OVERPASS_API_URL
    : undefined;

export const OVERPASS_FALLBACK_ENDPOINT = RAW_OVERPASS_ENDPOINT ?? 'https://overpass-api.de/api/interpreter';

export const OPENSTREETMAP_FALLBACK_ATTRIBUTION: PlaceAttribution = {
  text: 'Fallback data sourced from OpenStreetMap.',
  url: 'https://www.openstreetmap.org/copyright',
  license: 'ODbL',
};

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string> | null;
};

const parseTagList = (value?: string | null) =>
  (value ?? '')
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const dedupeElements = (elements: OverpassElement[]): OverpassElement[] => {
  const seen = new Set<string>();
  const result: OverpassElement[] = [];
  elements.forEach((element) => {
    const key = `${element.type}:${element.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(element);
  });
  return result;
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const describeAddress = (tags: Record<string, string>) => {
  const addressParts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:neighbourhood'],
    tags['addr:suburb'],
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    address: addressParts || tags['addr:place'] || tags['addr:full'] || undefined,
    locality: tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || tags['addr:municipality'],
    region: tags['addr:state'] || tags['addr:province'] || tags['is_in:state'],
    country: tags['addr:country'],
    postcode: tags['addr:postcode'] || tags['postal_code'] || tags['addr:postalcode'],
  };
};

const inferTags = (tags: Record<string, string>) =>
  Array.from(
    new Set(
      [tags.sport, tags.leisure, tags.amenity, tags.club, tags.cuisine]
        .filter(Boolean)
        .flatMap((entry) => parseTagList(entry))
        .map((value) => value.toLowerCase()),
    ),
  );

const buildOverpassQuery = (lat: number, lng: number, radius: number, limit: number) => `
[out:json][timeout:25];
(
  node(around:${radius},${lat},${lng})["leisure"~"^(sports_centre|fitness_centre|stadium|pitch|park)$"];
  node(around:${radius},${lat},${lng})["amenity"~"^(gym|sports_hall|swimming_pool|community_centre)$"];
  node(around:${radius},${lat},${lng})["sport"];
  way(around:${radius},${lat},${lng})["leisure"~"^(sports_centre|fitness_centre|stadium|pitch|park)$"];
  way(around:${radius},${lat},${lng})["amenity"~"^(gym|sports_hall|swimming_pool|community_centre)$"];
  way(around:${radius},${lat},${lng})["sport"];
  relation(around:${radius},${lat},${lng})["sport"];
);
out center ${limit};
`;

const normaliseCategory = (value: string) => value.trim().toLowerCase();

export interface OverpassFallbackOptions {
  lat: number;
  lng: number;
  radiusMeters: number;
  limit: number;
  signal?: AbortSignal;
  categories?: string[];
  fetchImpl?: typeof fetch;
}

export const estimateRadiusFromBounds = (bounds: PlacesViewportQuery['bounds']): number => {
  const latSpan = Math.abs(bounds.ne.lat - bounds.sw.lat);
  const lngSpan = Math.abs(bounds.ne.lng - bounds.sw.lng);
  const centerLat = (bounds.ne.lat + bounds.sw.lat) / 2;
  const latMeters = latSpan * 111_320;
  const lngMeters = lngSpan * 111_320 * Math.cos(toRadians(centerLat));
  const spanMeters = Math.max(latMeters, Math.abs(lngMeters));
  const rawRadius = spanMeters / 2;
  return Math.max(250, Math.min(rawRadius || 2000, 5000));
};

export async function fetchOverpassPlaceSummaries(options: OverpassFallbackOptions): Promise<PlaceSummary[]> {
  const { lat, lng, radiusMeters, limit, signal, categories, fetchImpl } = options;
  const http = fetchImpl ?? globalThis.fetch;
  if (!http) {
    throw new Error('Global fetch API is not available. Pass fetchImpl explicitly to fetchOverpassPlaceSummaries.');
  }

  const safeRadius = Math.max(250, Math.min(Math.round(radiusMeters), 5000));
  const requestLimit = Math.max(60, Math.min(limit * 3, 400));
  const overpassQuery = buildOverpassQuery(lat, lng, safeRadius, requestLimit);

  const response = await http(OVERPASS_FALLBACK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: new URLSearchParams({ data: overpassQuery }).toString(),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed (${response.status})`);
  }

  const payload = (await response.json()) as { elements?: OverpassElement[] };
  const elements = dedupeElements(payload.elements ?? []);

  const categoryFilter = (categories ?? []).map(normaliseCategory).filter(Boolean);
  const results: Array<{ summary: PlaceSummary; distance: number }> = [];

  elements.forEach((element) => {
    const latValue = typeof element.lat === 'number' ? element.lat : element.center?.lat;
    const lngValue = typeof element.lon === 'number' ? element.lon : element.center?.lon;
    if (typeof latValue !== 'number' || typeof lngValue !== 'number') return;

    const tags = element.tags ?? {};
    const name = tags.name || tags['name:en'] || tags['alt_name'] || 'Local activity spot';

    const inferredTags = inferTags(tags);
    if (categoryFilter.length && !categoryFilter.some((value) => inferredTags.includes(value))) {
      return;
    }

    const categoriesForPlace = inferredTags.length ? inferredTags : ['activity'];
    const { address, locality, region, country, postcode } = describeAddress(tags);

    const summary: PlaceSummary = {
      id: `${element.type}:${element.id}`,
      slug: null,
      name,
      lat: latValue,
      lng: lngValue,
      categories: categoriesForPlace,
      tags: inferredTags,
      address: address ?? null,
      city: locality ?? null,
      locality: locality ?? null,
      region: region ?? null,
      country: country ?? null,
      postcode: postcode ?? null,
      description: null,
      fsqId: null,
      aggregatedFrom: ['openstreetmap'],
      primarySource: 'openstreetmap',
      attributions: [
        {
          provider: 'openstreetmap',
          text: '© OpenStreetMap contributors',
          url: 'https://www.openstreetmap.org/copyright',
          license: 'ODbL',
        },
      ],
      metadata: {
        openstreetmap: {
          tags,
        },
        fallback: true,
      },
      transient: true,
    };

    const distance = haversineMeters(lat, lng, latValue, lngValue);
    results.push({ summary, distance });
  });

  results.sort((a, b) => a.distance - b.distance);
  return results.slice(0, limit).map((entry) => entry.summary);
}
