import ngeohash from 'ngeohash';

import { fetchPlacesForViewport } from './aggregator';
import type { PlacesQuery } from './types';

const CITY_SLUG = 'bangkok';
const CENTER_LAT = 13.7563;
const CENTER_LNG = 100.5018;
const TILE_PRECISION = 6;
const DEFAULT_TILE_COUNT = 10;
const MAX_TILE_COUNT = 20;

const buildTiles = (target: number): string[] => {
  const centerTile = ngeohash.encode(CENTER_LAT, CENTER_LNG, TILE_PRECISION);
  const tiles = new Set<string>([centerTile]);
  const queue: string[] = [centerTile];

  while (tiles.size < target && queue.length) {
    const current = queue.shift()!;
    const neighbours = ngeohash.neighbors(current);
    neighbours.forEach((neighbour) => {
      if (!tiles.has(neighbour) && tiles.size < target) {
        tiles.add(neighbour);
        queue.push(neighbour);
      }
    });
  }

  return Array.from(tiles);
};

const toQuery = (tile: string): PlacesQuery => {
  const [minLat, minLng, maxLat, maxLng] = ngeohash.decode_bbox(tile);
  return {
    bounds: {
      sw: { lat: minLat, lng: minLng },
      ne: { lat: maxLat, lng: maxLng },
    },
    limit: 200,
    forceRefresh: true,
    city: CITY_SLUG,
  };
};

export type WarmTileResult = {
  tile: string;
  placeCount: number;
  cacheHit: boolean;
  providerCounts: Record<string, number>;
  durationMs: number;
  error?: string;
};

export const warmBangkokTiles = async (requestedCount?: number): Promise<{
  city: string;
  requestedCount: number;
  tilesAttempted: number;
  summary: WarmTileResult[];
}> => {
  const count = Math.min(Math.max(requestedCount ?? DEFAULT_TILE_COUNT, 1), MAX_TILE_COUNT);
  const tiles = buildTiles(count);
  const summary: WarmTileResult[] = [];

  for (const tile of tiles) {
    const query = toQuery(tile);
    const started = Date.now();
    try {
      const result = await fetchPlacesForViewport(query);
      summary.push({
        tile,
        placeCount: result.places.length,
        cacheHit: result.cacheHit,
        providerCounts: result.providerCounts,
        durationMs: Date.now() - started,
      });
    } catch (error) {
      summary.push({
        tile,
        placeCount: 0,
        cacheHit: false,
        providerCounts: {},
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    city: CITY_SLUG,
    requestedCount: count,
    tilesAttempted: tiles.length,
    summary,
  };
};
