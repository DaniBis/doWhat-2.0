import { fetchPlacesForViewport } from '@/lib/places/aggregator';
import { recordPlacesMetrics } from '@/lib/places/metrics';
import type { PlacesQuery } from '@/lib/places/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PILOT_TILES: Array<Pick<PlacesQuery, 'bounds' | 'categories' | 'limit'>> = [
  {
    bounds: {
      sw: { lat: 13.650, lng: 100.350 },
      ne: { lat: 13.900, lng: 100.650 },
    },
    categories: [],
    limit: 250,
  },
  {
    bounds: {
      sw: { lat: 13.700, lng: 100.650 },
      ne: { lat: 13.950, lng: 100.950 },
    },
    categories: [],
    limit: 250,
  },
  {
    bounds: {
      sw: { lat: 20.930, lng: 105.710 },
      ne: { lat: 21.110, lng: 105.880 },
    },
    categories: [],
    limit: 250,
  },
  {
    bounds: {
      sw: { lat: 21.000, lng: 105.880 },
      ne: { lat: 21.150, lng: 106.050 },
    },
    categories: [],
    limit: 250,
  },
];

const validateSecret = (request: Request): boolean => {
  const headerSecret = request.headers.get('x-cron-secret');
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('cron_secret');
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return headerSecret === secret || querySecret === secret;
};

export async function POST(request: Request) {
  if (!validateSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summary: Array<{ tile: number; cacheHit: boolean; places: number; latencyMs: number }> = [];

  for (let index = 0; index < PILOT_TILES.length; index += 1) {
    const tile = PILOT_TILES[index];
    const query: PlacesQuery = {
      bounds: tile.bounds,
      categories: tile.categories,
      limit: tile.limit,
      forceRefresh: true,
    };
    const start = Date.now();
    const result = await fetchPlacesForViewport(query);
    const latency = Date.now() - start;
    summary.push({ tile: index, cacheHit: result.cacheHit, places: result.places.length, latencyMs: latency });
    await recordPlacesMetrics({
      query,
      cacheHit: result.cacheHit,
      latencyMs: latency,
      providerCounts: result.providerCounts,
    });
  }

  return Response.json({ refreshed: summary });
}
