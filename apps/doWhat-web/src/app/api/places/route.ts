import { fetchPlacesForViewport } from '@/lib/places/aggregator';
import { recordPlacesMetrics } from '@/lib/places/metrics';
import type { PlacesQuery } from '@/lib/places/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const parseCoordinatePair = (value: string | null): { lat: number; lng: number } | null => {
  if (!value) return null;
  const parts = value.split(',').map((part) => Number.parseFloat(part.trim()));
  if (parts.length !== 2 || parts.some((part) => Number.isNaN(part))) return null;
  const [lat, lng] = parts;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

const dedupeAttributions = (places: Awaited<ReturnType<typeof fetchPlacesForViewport>>['places']) => {
  const map = new Map<string, { text: string; url?: string; license?: string }>();
  places.forEach((place) => {
    place.attributions.forEach((attribution) => {
      const key = `${attribution.provider}:${attribution.text}:${attribution.url ?? ''}`;
      if (!map.has(key)) {
        map.set(key, { text: attribution.text, url: attribution.url, license: attribution.license });
      }
    });
  });
  return Array.from(map.values());
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sw = parseCoordinatePair(url.searchParams.get('sw'));
  const ne = parseCoordinatePair(url.searchParams.get('ne'));
  if (!sw || !ne) {
    return Response.json({ error: 'Invalid or missing sw/ne parameters' }, { status: 400 });
  }

  const categoriesParam = (url.searchParams.get('categories') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const categories = categoriesParam.length ? categoriesParam : undefined;
  const force = url.searchParams.get('force');
  const forceRefresh = force === '1' || force?.toLowerCase() === 'true';
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
  if (limit != null && (!Number.isFinite(limit) || limit <= 0)) {
    return Response.json({ error: 'Invalid limit parameter' }, { status: 400 });
  }
  const cityParam = url.searchParams.get('city');
  const city = cityParam ? cityParam.trim().toLowerCase() : undefined;

  const query: PlacesQuery = {
    bounds: { sw, ne },
    categories,
    limit,
    forceRefresh,
    city,
  };

  const start = Date.now();

  try {
    const result = await fetchPlacesForViewport(query);
    const latency = Date.now() - start;
    recordPlacesMetrics({ query, cacheHit: result.cacheHit, latencyMs: latency, providerCounts: result.providerCounts }).catch(() => {
      // ignore background metric errors (already logged)
    });

    return Response.json({
      cacheHit: result.cacheHit,
      places: result.places,
      providerCounts: result.providerCounts,
      attribution: dedupeAttributions(result.places),
      latencyMs: latency,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load places';
    const latency = Date.now() - start;
    const isFetchFailure = message.toLowerCase().includes('fetch failed');
    console.error('Places endpoint error', error);
    if (isFetchFailure && process.env.NODE_ENV !== 'production') {
      return Response.json({
        cacheHit: false,
        places: [],
        providerCounts: { openstreetmap: 0, foursquare: 0, google_places: 0 },
        attribution: [],
        latencyMs: latency,
        degraded: true,
        error: message,
      });
    }
    if (process.env.NODE_ENV !== 'production') {
      return Response.json(
        {
          error: message,
          debug:
            error && typeof error === 'object'
              ? Object.fromEntries(Object.entries(error as Record<string, unknown>).slice(0, 8))
              : String(error),
        },
        { status: 500 },
      );
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
