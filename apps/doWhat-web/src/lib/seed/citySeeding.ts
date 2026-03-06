import { createHash } from 'node:crypto';

import ngeohash from 'ngeohash';

import { matchActivitiesForPlaces, type MatchSummary } from '@/lib/places/activityMatching';
import { fetchPlacesForViewport } from '@/lib/places/aggregator';
import { recordPlacesMetrics } from '@/lib/places/metrics';
import type {
  PlacesFetchExplain,
  PlaceProvider,
  PlacesQuery,
  ViewportBounds,
} from '@/lib/places/types';
import { haversineMeters } from '@/lib/places/utils';
import { createServiceClient } from '@/lib/supabase/service';

type SeedMode = 'full' | 'incremental';

type Coordinate = { lat: number; lng: number };

type CityHotspot = {
  label: string;
  bbox: ViewportBounds;
};

type SeedPack = {
  key: string;
  label: string;
  categories: string[];
  limitMultiplier?: number;
};

type CitySeedPreset = {
  slug: string;
  label: string;
  center: Coordinate;
  bbox: ViewportBounds;
  hotspots: CityHotspot[];
  matchCity: string;
  defaultPacks: string[];
};

type CitySeedConfigInput = {
  city: string;
  center?: Coordinate;
  bounds?: ViewportBounds;
};

type SeedCityOptions = {
  city: string;
  mode?: SeedMode;
  tiles?: number;
  maxTiles?: number;
  precision?: number;
  limitPerTile?: number;
  center?: Coordinate;
  bounds?: ViewportBounds;
  inferActivities?: boolean;
  refresh?: boolean;
  packs?: string[];
  packVersion?: string;
};

type TileSeedSummary = {
  geohash6: string;
  pack: string;
  packVersion: string;
  bounds: ViewportBounds;
  hotspot: boolean;
  distanceMeters: number;
  latencyMs: number;
  cacheHit: boolean;
  cacheKey: string;
  placeCount: number;
  providerCounts: Record<PlaceProvider, number>;
  pagesFetched: number;
  nextPageTokensUsed: number;
  itemsBeforeDedupe: number;
  itemsAfterDedupe: number;
  itemsAfterGates: number;
  itemsAfterFilters: number;
  dropReasons: Record<string, number>;
  refreshedAt: string;
  error?: string;
};

type InferenceTotals = {
  processed: number;
  matches: number;
  upserts: number;
  deletes: number;
  manualApplied: number;
  errors: number;
};

export type CitySeedResult = {
  city: string;
  mode: SeedMode;
  packVersion: string;
  packs: string[];
  precision: number;
  tilesRequested: number;
  tilesAttempted: number;
  uniquePlaces: number;
  providerTotals: Record<PlaceProvider, number>;
  totals: {
    placeCount: number;
    failedTiles: number;
    totalLatencyMs: number;
  };
  explain: {
    providerCounts: Record<PlaceProvider, number>;
    pagesFetched: number;
    nextPageTokensUsed: number;
    itemsBeforeDedupe: number;
    itemsAfterDedupe: number;
    itemsAfterGates: number;
    itemsAfterFilters: number;
    cacheHits: number;
    cacheKeys: string[];
    tilesTouched: string[];
    dropReasons: Record<string, number>;
  };
  inference: InferenceTotals | null;
  tiles: TileSeedSummary[];
};

type TileCandidate = {
  geohash6: string;
  bounds: ViewportBounds;
  center: Coordinate;
  hotspot: boolean;
  distanceMeters: number;
};

const DEFAULT_PRECISION = 6;
const DEFAULT_TILE_LIMIT = 120;
const MAX_TILE_LIMIT = 700;
const LIMIT_PER_TILE_DEFAULT = 220;
const DEFAULT_PACK_VERSION = '2026-03-04.v1';

const PACK_REGISTRY: Record<string, SeedPack> = {
  parks_sports: {
    key: 'parks_sports',
    label: 'Parks + sports centres',
    categories: ['activity', 'fitness', 'outdoors', 'park', 'sports centre', 'pitch', 'running'],
    limitMultiplier: 1.35,
  },
  climbing_bouldering: {
    key: 'climbing_bouldering',
    label: 'Climbing + bouldering',
    categories: [
      'fitness',
      'climbing',
      'bouldering',
      'rock_climbing',
      'climbing gym',
      'boulder',
      'sala escalada',
      'leo nui',
      'phong tap leo nui',
      'ยิมปีนผา',
      'โบลเดอร์',
    ],
    limitMultiplier: 1.6,
  },
  padel: {
    key: 'padel',
    label: 'Padel courts',
    categories: ['fitness', 'padel', 'pádel', 'padel court', 'padel club', 'สนามพาเดล', 'sân padel'],
    limitMultiplier: 1.4,
  },
  running: {
    key: 'running',
    label: 'Running parks and tracks',
    categories: ['outdoors', 'running', 'jogging', 'track', 'trail', 'park', 'công viên chạy bộ'],
    limitMultiplier: 1.2,
  },
  yoga: {
    key: 'yoga',
    label: 'Yoga studios',
    categories: ['fitness', 'wellness', 'yoga', 'yoga studio', 'phòng yoga', 'สตูดิโอโยคะ'],
    limitMultiplier: 1.1,
  },
  chess: {
    key: 'chess',
    label: 'Chess cafes and clubs',
    categories: ['community', 'chess', 'chess club', 'board games', 'cafe chess', 'cờ vua', 'หมากรุก'],
    limitMultiplier: 1.05,
  },
};

const CITY_PRESETS: Record<string, CitySeedPreset> = {
  hanoi: {
    slug: 'hanoi',
    label: 'Hanoi',
    center: { lat: 21.0285, lng: 105.8542 },
    bbox: {
      sw: { lat: 20.86, lng: 105.62 },
      ne: { lat: 21.26, lng: 106.10 },
    },
    hotspots: [
      {
        label: 'old-quarter',
        bbox: {
          sw: { lat: 21.020, lng: 105.840 },
          ne: { lat: 21.045, lng: 105.875 },
        },
      },
      {
        label: 'west-lake',
        bbox: {
          sw: { lat: 21.040, lng: 105.800 },
          ne: { lat: 21.075, lng: 105.835 },
        },
      },
      {
        label: 'climbing-gyms',
        bbox: {
          sw: { lat: 21.005, lng: 105.805 },
          ne: { lat: 21.055, lng: 105.875 },
        },
      },
    ],
    matchCity: 'Hanoi',
    defaultPacks: ['parks_sports', 'climbing_bouldering', 'running', 'yoga', 'chess'],
  },
  bangkok: {
    slug: 'bangkok',
    label: 'Bangkok',
    center: { lat: 13.7563, lng: 100.5018 },
    bbox: {
      sw: { lat: 13.48, lng: 100.24 },
      ne: { lat: 14.06, lng: 100.95 },
    },
    hotspots: [
      {
        label: 'asok-sukhumvit',
        bbox: {
          sw: { lat: 13.724, lng: 100.550 },
          ne: { lat: 13.750, lng: 100.585 },
        },
      },
      {
        label: 'ari',
        bbox: {
          sw: { lat: 13.764, lng: 100.532 },
          ne: { lat: 13.790, lng: 100.552 },
        },
      },
      {
        label: 'rama9',
        bbox: {
          sw: { lat: 13.742, lng: 100.560 },
          ne: { lat: 13.772, lng: 100.605 },
        },
      },
      {
        label: 'lumpini',
        bbox: {
          sw: { lat: 13.723, lng: 100.534 },
          ne: { lat: 13.744, lng: 100.553 },
        },
      },
    ],
    matchCity: 'Bangkok',
    defaultPacks: ['parks_sports', 'climbing_bouldering', 'padel', 'running', 'yoga', 'chess'],
  },
  danang: {
    slug: 'danang',
    label: 'Da Nang',
    center: { lat: 16.0544, lng: 108.2022 },
    bbox: {
      sw: { lat: 15.95, lng: 108.06 },
      ne: { lat: 16.20, lng: 108.33 },
    },
    hotspots: [
      {
        label: 'my-khe',
        bbox: {
          sw: { lat: 16.045, lng: 108.236 },
          ne: { lat: 16.075, lng: 108.255 },
        },
      },
      {
        label: 'city-center',
        bbox: {
          sw: { lat: 16.045, lng: 108.200 },
          ne: { lat: 16.082, lng: 108.225 },
        },
      },
      {
        label: 'expat-an-thuong',
        bbox: {
          sw: { lat: 16.037, lng: 108.230 },
          ne: { lat: 16.058, lng: 108.250 },
        },
      },
    ],
    matchCity: 'Da Nang',
    defaultPacks: ['parks_sports', 'climbing_bouldering', 'padel', 'running', 'yoga', 'chess'],
  },
  bucharest: {
    slug: 'bucharest',
    label: 'Bucharest',
    center: { lat: 44.4268, lng: 26.1025 },
    bbox: {
      sw: { lat: 44.25, lng: 25.95 },
      ne: { lat: 44.6, lng: 26.35 },
    },
    hotspots: [
      {
        label: 'city-core',
        bbox: {
          sw: { lat: 44.41, lng: 26.05 },
          ne: { lat: 44.46, lng: 26.14 },
        },
      },
    ],
    matchCity: 'Bucharest',
    defaultPacks: ['parks_sports', 'climbing_bouldering'],
  },
};

const emptyProviderCounts = (): Record<PlaceProvider, number> => ({
  openstreetmap: 0,
  foursquare: 0,
  google_places: 0,
});

const coerceTileCount = (value?: number) => {
  if (!Number.isFinite(value)) return DEFAULT_TILE_LIMIT;
  return Math.min(MAX_TILE_LIMIT, Math.max(1, Math.floor(value as number)));
};

const coercePrecision = (value?: number) => {
  if (!Number.isFinite(value)) return DEFAULT_PRECISION;
  return Math.min(7, Math.max(5, Math.floor(value as number)));
};

const normalizeCitySlug = (value: string) => value.trim().toLowerCase();

const resolveCityConfig = (input: CitySeedConfigInput): CitySeedPreset => {
  const slug = normalizeCitySlug(input.city);
  const preset = CITY_PRESETS[slug];
  if (preset) return preset;
  if (!input.center || !input.bounds) {
    throw new Error(
      `Unknown city '${input.city}'. Provide --center and --bounds to run generic city seeding.`,
    );
  }
  return {
    slug,
    label: input.city.trim(),
    center: input.center,
    bbox: input.bounds,
    hotspots: [{ label: 'custom', bbox: input.bounds }],
    matchCity: input.city.trim(),
    defaultPacks: ['parks_sports', 'climbing_bouldering'],
  };
};

const resolvePackVersion = (value?: string): string => {
  const raw = value?.trim();
  if (!raw) return DEFAULT_PACK_VERSION;
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 64) || DEFAULT_PACK_VERSION;
};

const expandPackArgs = (values: string[] | undefined): string[] => {
  if (!values?.length) return [];
  return values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
};

const resolvePacks = (city: CitySeedPreset, requested?: string[]): SeedPack[] => {
  const normalizedRequested = expandPackArgs(requested);
  const source = normalizedRequested.length ? normalizedRequested : city.defaultPacks;
  const wantsAll = source.includes('all') || source.includes('*');
  const keys = wantsAll ? Object.keys(PACK_REGISTRY) : source;

  const seen = new Set<string>();
  const resolved: SeedPack[] = [];
  for (const key of keys) {
    const pack = PACK_REGISTRY[key];
    if (!pack) {
      throw new Error(
        `Unknown seed pack '${key}'. Available packs: ${Object.keys(PACK_REGISTRY).sort().join(', ')}`,
      );
    }
    if (seen.has(pack.key)) continue;
    seen.add(pack.key);
    resolved.push(pack);
  }
  return resolved;
};

const round = (value: number) => Number(value.toFixed(6));

const inBbox = (coord: Coordinate, bbox: ViewportBounds): boolean => {
  return (
    coord.lat >= bbox.sw.lat
    && coord.lat <= bbox.ne.lat
    && coord.lng >= bbox.sw.lng
    && coord.lng <= bbox.ne.lng
  );
};

const buildGeohashTiles = (
  city: CitySeedPreset,
  precision: number,
  tileLimit: number,
): TileCandidate[] => {
  const baseHash = ngeohash.encode(city.center.lat, city.center.lng, precision);
  const [hashMinLat, hashMinLng, hashMaxLat, hashMaxLng] = ngeohash.decode_bbox(baseHash);
  const latStep = Math.max((hashMaxLat - hashMinLat) * 0.92, 0.00001);
  const lngStep = Math.max((hashMaxLng - hashMinLng) * 0.92, 0.00001);

  const hashes = new Set<string>();
  const { sw, ne } = city.bbox;
  for (let lat = sw.lat; lat <= ne.lat + latStep; lat += latStep) {
    for (let lng = sw.lng; lng <= ne.lng + lngStep; lng += lngStep) {
      const safeLat = Math.min(ne.lat - 0.000001, Math.max(sw.lat, lat));
      const safeLng = Math.min(ne.lng - 0.000001, Math.max(sw.lng, lng));
      hashes.add(ngeohash.encode(safeLat, safeLng, precision));
    }
  }

  hashes.add(ngeohash.encode(sw.lat, sw.lng, precision));
  hashes.add(ngeohash.encode(sw.lat, ne.lng, precision));
  hashes.add(ngeohash.encode(ne.lat, sw.lng, precision));
  hashes.add(ngeohash.encode(ne.lat, ne.lng, precision));
  hashes.add(baseHash);

  const candidates = Array.from(hashes).map<TileCandidate>((geohash6) => {
    const [minLat, minLng, maxLat, maxLng] = ngeohash.decode_bbox(geohash6);
    const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
    const hotspot = city.hotspots.some((item) => inBbox(center, item.bbox));
    return {
      geohash6,
      center,
      hotspot,
      bounds: {
        sw: { lat: round(minLat), lng: round(minLng) },
        ne: { lat: round(maxLat), lng: round(maxLng) },
      },
      distanceMeters: haversineMeters(city.center.lat, city.center.lng, center.lat, center.lng),
    };
  });

  return candidates
    .sort((a, b) => {
      if (a.hotspot !== b.hotspot) return a.hotspot ? -1 : 1;
      if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
      return a.geohash6.localeCompare(b.geohash6);
    })
    .slice(0, tileLimit);
};

const addProviderCounts = (
  target: Record<PlaceProvider, number>,
  delta: Record<PlaceProvider, number>,
) => {
  target.openstreetmap += delta.openstreetmap ?? 0;
  target.foursquare += delta.foursquare ?? 0;
  target.google_places += delta.google_places ?? 0;
};

const addNumberMap = (target: Record<string, number>, delta: Record<string, number>) => {
  Object.entries(delta).forEach(([key, value]) => {
    if (!Number.isFinite(value)) return;
    target[key] = (target[key] ?? 0) + Number(value);
  });
};

const summarizeInference = (summaries: MatchSummary[]): InferenceTotals => {
  return summaries.reduce<InferenceTotals>(
    (acc, item) => ({
      processed: acc.processed + item.processed,
      matches: acc.matches + item.matches,
      upserts: acc.upserts + item.upserts,
      deletes: acc.deletes + item.deletes,
      manualApplied: acc.manualApplied + item.manualApplied,
      errors: acc.errors + item.errors.length,
    }),
    {
      processed: 0,
      matches: 0,
      upserts: 0,
      deletes: 0,
      manualApplied: 0,
      errors: 0,
    },
  );
};

const runInferenceForPlaces = async (placeIds: string[], city?: string): Promise<InferenceTotals | null> => {
  if (!placeIds.length) return null;
  const chunkSize = 280;
  const summaries: MatchSummary[] = [];
  for (let index = 0; index < placeIds.length; index += chunkSize) {
    const chunk = placeIds.slice(index, index + chunkSize);
    const summary = await matchActivitiesForPlaces({
      placeIds: chunk,
      city,
      limit: chunk.length,
    });
    summaries.push(summary);
  }
  return summarizeInference(summaries);
};

const buildPackFilterSignature = (pack: SeedPack): string => {
  const categories = [...pack.categories]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return categories.join('|');
};

const buildSeedCacheKey = (input: {
  city: string;
  geohash6: string;
  pack: SeedPack;
  packVersion: string;
}): string => {
  const signature = buildPackFilterSignature(input.pack);
  const hash = createHash('sha1').update(signature).digest('hex').slice(0, 10);
  return `seed:${input.packVersion}:${input.city}:${input.geohash6}:${input.pack.key}:${hash}`;
};

const extractCacheRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const upsertSeedCache = async (input: {
  service: ReturnType<typeof createServiceClient>;
  geohash6: string;
  cacheKey: string;
  payload: Record<string, unknown>;
  providerCounts: Record<PlaceProvider, number>;
  refreshedAt: string;
  expiresAt: string;
}) => {
  try {
    const { data, error } = await input.service
      .from('place_tiles')
      .select('discovery_cache')
      .eq('geohash6', input.geohash6)
      .maybeSingle();

    if (error) {
      const message = `${error.message ?? ''} ${error.hint ?? ''}`.toLowerCase();
      if (message.includes('discovery_cache')) {
        return;
      }
      throw error;
    }

    const record = extractCacheRecord(data?.discovery_cache ?? null);
    record[input.cacheKey] = {
      ...input.payload,
      cachedAt: input.refreshedAt,
      expiresAt: input.expiresAt,
    };

    const { error: upsertError } = await input.service
      .from('place_tiles')
      .upsert(
        {
          geohash6: input.geohash6,
          refreshed_at: input.refreshedAt,
          expires_at: input.expiresAt,
          provider_counts: input.providerCounts,
          discovery_cache: record,
        },
        { onConflict: 'geohash6' },
      );
    if (upsertError) throw upsertError;
  } catch (error) {
    console.warn('[seed:city] tile cache upsert failed', error);
  }
};

const normalizeExplain = (explain: PlacesFetchExplain | undefined): PlacesFetchExplain => {
  return (
    explain ?? {
      cacheHit: false,
      cacheKey: '',
      tileKey: '',
      tilesTouched: [],
      providerCounts: emptyProviderCounts(),
      pagesFetched: 0,
      nextPageTokensUsed: 0,
      itemsBeforeDedupe: 0,
      itemsAfterDedupe: 0,
      itemsAfterGates: 0,
      itemsAfterFilters: 0,
      dropReasons: {},
      providerStats: [],
    }
  );
};

export const listSeedCities = (): string[] => Object.keys(CITY_PRESETS);

export const listSeedPacks = (): string[] => Object.keys(PACK_REGISTRY);

export const seedCityInventory = async (options: SeedCityOptions): Promise<CitySeedResult> => {
  const service = createServiceClient();

  const mode: SeedMode = options.mode === 'incremental' ? 'incremental' : 'full';
  const precision = coercePrecision(options.precision);
  const tileLimit = coerceTileCount(options.maxTiles ?? options.tiles);
  const packVersion = resolvePackVersion(options.packVersion);
  const city = resolveCityConfig({
    city: options.city,
    center: options.center,
    bounds: options.bounds,
  });
  const packs = resolvePacks(city, options.packs);
  const refresh = options.refresh ?? mode === 'full';

  const tiles = buildGeohashTiles(city, precision, tileLimit);
  const providerTotals = emptyProviderCounts();
  const placeIds = new Set<string>();
  const summaries: TileSeedSummary[] = [];

  const explainTotals = {
    providerCounts: emptyProviderCounts(),
    pagesFetched: 0,
    nextPageTokensUsed: 0,
    itemsBeforeDedupe: 0,
    itemsAfterDedupe: 0,
    itemsAfterGates: 0,
    itemsAfterFilters: 0,
    cacheHits: 0,
    cacheKeys: new Set<string>(),
    tilesTouched: new Set<string>(),
    dropReasons: {} as Record<string, number>,
  };

  for (const tile of tiles) {
    for (const pack of packs) {
      const query: PlacesQuery = {
        bounds: tile.bounds,
        categories: pack.categories,
        city: city.slug,
        limit: Math.max(
          80,
          Math.round((options.limitPerTile ?? LIMIT_PER_TILE_DEFAULT) * (pack.limitMultiplier ?? 1)),
        ),
        forceRefresh: refresh,
        persistGoogle: true,
        explain: true,
      };

      const started = Date.now();
      const refreshedAt = new Date().toISOString();
      const seedCacheKey = buildSeedCacheKey({
        city: city.slug,
        geohash6: tile.geohash6,
        pack,
        packVersion,
      });

      try {
        const result = await fetchPlacesForViewport(query);
        const explain = normalizeExplain(result.explain);
        const latencyMs = Date.now() - started;

        addProviderCounts(providerTotals, result.providerCounts);
        addProviderCounts(explainTotals.providerCounts, result.providerCounts);
        result.places.forEach((place) => {
          if (!place.transient && place.id) {
            placeIds.add(place.id);
          }
        });

        explainTotals.pagesFetched += explain.pagesFetched;
        explainTotals.nextPageTokensUsed += explain.nextPageTokensUsed;
        explainTotals.itemsBeforeDedupe += explain.itemsBeforeDedupe;
        explainTotals.itemsAfterDedupe += explain.itemsAfterDedupe;
        explainTotals.itemsAfterGates += explain.itemsAfterGates;
        explainTotals.itemsAfterFilters += explain.itemsAfterFilters;
        if (result.cacheHit) explainTotals.cacheHits += 1;
        if (explain.cacheKey) explainTotals.cacheKeys.add(explain.cacheKey);
        explain.tilesTouched.forEach((value) => explainTotals.tilesTouched.add(value));
        addNumberMap(explainTotals.dropReasons, explain.dropReasons);

        summaries.push({
          geohash6: tile.geohash6,
          pack: pack.key,
          packVersion,
          bounds: tile.bounds,
          hotspot: tile.hotspot,
          distanceMeters: Number(tile.distanceMeters.toFixed(2)),
          latencyMs,
          cacheHit: result.cacheHit,
          cacheKey: explain.cacheKey || seedCacheKey,
          placeCount: result.places.length,
          providerCounts: result.providerCounts,
          pagesFetched: explain.pagesFetched,
          nextPageTokensUsed: explain.nextPageTokensUsed,
          itemsBeforeDedupe: explain.itemsBeforeDedupe,
          itemsAfterDedupe: explain.itemsAfterDedupe,
          itemsAfterGates: explain.itemsAfterGates,
          itemsAfterFilters: explain.itemsAfterFilters,
          dropReasons: explain.dropReasons,
          refreshedAt,
        });

        await recordPlacesMetrics({
          query,
          cacheHit: result.cacheHit,
          latencyMs,
          providerCounts: result.providerCounts,
        });

        const seedPayload = {
          city: city.slug,
          pack: pack.key,
          packLabel: pack.label,
          packVersion,
          geohash6: tile.geohash6,
          hotspot: tile.hotspot,
          mode,
          refresh,
          filterSignature: buildPackFilterSignature(pack),
          providerCounts: result.providerCounts,
          explain: {
            cacheHit: result.cacheHit,
            cacheKey: explain.cacheKey,
            pagesFetched: explain.pagesFetched,
            nextPageTokensUsed: explain.nextPageTokensUsed,
            itemsBeforeDedupe: explain.itemsBeforeDedupe,
            itemsAfterDedupe: explain.itemsAfterDedupe,
            itemsAfterGates: explain.itemsAfterGates,
            itemsAfterFilters: explain.itemsAfterFilters,
            dropReasons: explain.dropReasons,
            tilesTouched: explain.tilesTouched,
          },
        };

        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await upsertSeedCache({
          service,
          geohash6: tile.geohash6,
          cacheKey: seedCacheKey,
          payload: seedPayload,
          providerCounts: result.providerCounts,
          refreshedAt,
          expiresAt,
        });
      } catch (error) {
        const latencyMs = Date.now() - started;
        summaries.push({
          geohash6: tile.geohash6,
          pack: pack.key,
          packVersion,
          bounds: tile.bounds,
          hotspot: tile.hotspot,
          distanceMeters: Number(tile.distanceMeters.toFixed(2)),
          latencyMs,
          cacheHit: false,
          cacheKey: seedCacheKey,
          placeCount: 0,
          providerCounts: emptyProviderCounts(),
          pagesFetched: 0,
          nextPageTokensUsed: 0,
          itemsBeforeDedupe: 0,
          itemsAfterDedupe: 0,
          itemsAfterGates: 0,
          itemsAfterFilters: 0,
          dropReasons: { providerError: 1 },
          refreshedAt,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const inferenceEnabled = options.inferActivities !== false;
  const inference = inferenceEnabled
    ? await runInferenceForPlaces(Array.from(placeIds), city.matchCity)
    : null;

  const totals = summaries.reduce(
    (acc, row) => {
      acc.placeCount += row.placeCount;
      acc.totalLatencyMs += row.latencyMs;
      if (row.error) acc.failedTiles += 1;
      return acc;
    },
    { placeCount: 0, failedTiles: 0, totalLatencyMs: 0 },
  );

  return {
    city: city.slug,
    mode,
    packVersion,
    packs: packs.map((pack) => pack.key),
    precision,
    tilesRequested: tileLimit,
    tilesAttempted: summaries.length,
    uniquePlaces: placeIds.size,
    providerTotals,
    totals,
    explain: {
      providerCounts: explainTotals.providerCounts,
      pagesFetched: explainTotals.pagesFetched,
      nextPageTokensUsed: explainTotals.nextPageTokensUsed,
      itemsBeforeDedupe: explainTotals.itemsBeforeDedupe,
      itemsAfterDedupe: explainTotals.itemsAfterDedupe,
      itemsAfterGates: explainTotals.itemsAfterGates,
      itemsAfterFilters: explainTotals.itemsAfterFilters,
      cacheHits: explainTotals.cacheHits,
      cacheKeys: Array.from(explainTotals.cacheKeys).sort((a, b) => a.localeCompare(b)),
      tilesTouched: Array.from(explainTotals.tilesTouched).sort((a, b) => a.localeCompare(b)),
      dropReasons: explainTotals.dropReasons,
    },
    inference,
    tiles: summaries,
  };
};
