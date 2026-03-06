import type { DiscoveryDebug, DiscoveryResult } from './engine-core';
import { getOptionalServiceClient } from '@/lib/supabase/service';

type RecordDiscoveryExposureInput = {
  requestId?: string | null;
  query: {
    lat: number;
    lng: number;
    radiusMeters: number;
    limit: number;
    filtersApplied: number;
  };
  result: DiscoveryResult;
};

const shouldSample = (): boolean => {
  const rateRaw = process.env.DISCOVERY_EXPOSURE_SAMPLE_RATE;
  const rate = rateRaw == null ? 0.2 : Number(rateRaw);
  if (!Number.isFinite(rate) || rate <= 0) return false;
  if (rate >= 1) return true;
  return Math.random() < rate;
};

const shouldRunInTest = (): boolean => process.env.DISCOVERY_EXPOSURE_ALLOW_IN_TEST === '1';

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  return rounded > 0 ? rounded : fallback;
};

const getBatchSize = (): number => parsePositiveInt(process.env.DISCOVERY_EXPOSURE_BATCH_SIZE, 10);
const getFlushDelayMs = (): number => parsePositiveInt(process.env.DISCOVERY_EXPOSURE_FLUSH_MS, 1500);

const summarizeDebug = (debug?: DiscoveryDebug) => {
  if (!debug) return null;
  return {
    cacheHit: debug.cacheHit,
    cacheKey: debug.cacheKey,
    tilesTouched: debug.tilesTouched,
    providerCounts: debug.providerCounts,
    pagesFetched: debug.pagesFetched,
    nextPageTokensUsed: debug.nextPageTokensUsed,
    itemsBeforeDedupe: debug.itemsBeforeDedupe,
    itemsAfterDedupe: debug.itemsAfterDedupe,
    itemsAfterGates: debug.itemsAfterGates,
    itemsAfterFilters: debug.itemsAfterFilters,
    dropReasons: debug.dropReasons,
    candidateCounts: debug.candidateCounts,
    dropped: debug.dropped,
    ranking: debug.ranking,
  };
};

const dedupeDropRate = (debug?: DiscoveryDebug): number | null => {
  if (!debug) return null;
  const input = debug.candidateCounts.afterConfidenceGate;
  if (!input || input <= 0) return 0;
  return Number((Math.max(0, debug.dropped.deduped) / input).toFixed(4));
};

let warnedExposureInsertFailure = false;
let exposureQueue: Array<{
  requestId: string | null;
  query: Record<string, unknown>;
  result: Record<string, unknown>;
  at: string;
}> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const persistExposureBatch = async (
  rows: Array<{
    requestId: string | null;
    query: Record<string, unknown>;
    result: Record<string, unknown>;
    at: string;
  }>,
) => {
  if (!rows.length) return;
  const client = getOptionalServiceClient();
  if (!client) return;
  const payload = rows.map((row) => ({
    request_id: row.requestId,
    query: row.query,
    result: row.result,
    created_at: row.at,
  }));
  const { error } = await client
    .from('discovery_exposures')
    .insert(payload);
  if (error) {
    throw error;
  }
};

const clearFlushTimer = () => {
  if (!flushTimer) return;
  clearTimeout(flushTimer);
  flushTimer = null;
};

const flushExposureQueue = async (): Promise<void> => {
  clearFlushTimer();
  if (!exposureQueue.length) return;
  const rows = exposureQueue;
  exposureQueue = [];
  try {
    await persistExposureBatch(rows);
  } catch (error) {
    if (!warnedExposureInsertFailure) {
      console.warn('[discovery.exposure] failed to persist sampled exposure batch', error);
      warnedExposureInsertFailure = true;
    }
  }
};

const scheduleFlush = () => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    void flushExposureQueue();
  }, getFlushDelayMs());
};

export const recordDiscoveryExposure = async (input: RecordDiscoveryExposureInput): Promise<void> => {
  if (process.env.NODE_ENV === 'test' && !shouldRunInTest()) return;
  if (!shouldSample()) return;

  const topItems = input.result.items.slice(0, 5).map((item) => ({
    id: item.id,
    source: item.source ?? 'unknown',
    rankScore: item.rank_score ?? null,
    confidence: item.quality_confidence ?? null,
    dedupeKey: item.dedupe_key ?? null,
  }));

  const payload = {
    requestId: input.requestId ?? null,
    query: input.query,
    result: {
      count: input.result.count,
      source: input.result.source ?? null,
      degraded: Boolean(input.result.degraded),
      cache: input.result.cache ?? null,
      providerCounts: input.result.providerCounts ?? null,
      cacheHitRate: input.result.cache?.hit ? 1 : 0,
      dedupeDropRate: dedupeDropRate(input.result.debug),
      topItems,
      debug: summarizeDebug(input.result.debug),
    },
    at: new Date().toISOString(),
  };

  console.info('[discovery.exposure]', JSON.stringify(payload));
  exposureQueue.push(payload);
  if (exposureQueue.length >= getBatchSize()) {
    await flushExposureQueue();
    return;
  }
  scheduleFlush();
};

export const __telemetryTesting = {
  async flushNow() {
    await flushExposureQueue();
  },
  resetWarnings() {
    warnedExposureInsertFailure = false;
    clearFlushTimer();
    exposureQueue = [];
  },
};
