import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

const MAX_LIMIT = 5000;
const MAX_DAYS = 90;

type ExposureRow = {
  created_at: string | null;
  query?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
};

const parseAllowList = (): string[] =>
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
    .split(/[ ,]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const parseIntInRange = (value: string | null, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
};

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export async function GET(req: Request) {
  const supabase = createClient();
  const allowList = parseAllowList();

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) {
    return NextResponse.json({ error: String(authError) }, { status: 500 });
  }
  const actorEmail = authData?.user?.email?.toLowerCase() ?? null;
  if (!actorEmail || !allowList.includes(actorEmail)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const url = new URL(req.url);
  const days = parseIntInRange(url.searchParams.get('days'), 7, 1, MAX_DAYS);
  const limit = parseIntInRange(url.searchParams.get('limit'), 2000, 1, MAX_LIMIT);
  const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('discovery_exposures')
    .select('created_at,query,result')
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  const rows = (data as ExposureRow[] | null) ?? [];

  let cacheHitCount = 0;
  let degradedCount = 0;
  let totalReturnedItems = 0;
  let totalAfterConfidenceGate = 0;
  let droppedNotPlaceBacked = 0;
  let droppedLowConfidence = 0;
  let droppedDeduped = 0;
  let topRankScoreSum = 0;
  let topRankScoreCount = 0;
  const sourceCounts = new Map<string, number>();
  const hourlyCounts = new Map<string, number>();

  for (const row of rows) {
    if (row.created_at) {
      const date = new Date(row.created_at);
      if (!Number.isNaN(date.getTime())) {
        date.setMinutes(0, 0, 0);
        const key = date.toISOString();
        hourlyCounts.set(key, (hourlyCounts.get(key) ?? 0) + 1);
      }
    }

    const result = asObject(row.result);
    if (!result) continue;

    const source = typeof result.source === 'string' && result.source.trim() ? result.source.trim() : null;
    if (source) {
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    }

    const degraded = Boolean(result.degraded);
    if (degraded) degradedCount += 1;

    const cache = asObject(result.cache);
    const cacheHit = cache?.hit === true;
    if (cacheHit) cacheHitCount += 1;

    const count = asNumber(result.count);
    if (count != null) totalReturnedItems += count;

    const debug = asObject(result.debug);
    const candidateCounts = asObject(debug?.candidateCounts);
    const dropped = asObject(debug?.dropped);

    totalAfterConfidenceGate += asNumber(candidateCounts?.afterConfidenceGate) ?? 0;
    droppedNotPlaceBacked += asNumber(dropped?.notPlaceBacked) ?? 0;
    droppedLowConfidence += asNumber(dropped?.lowConfidence) ?? 0;
    droppedDeduped += asNumber(dropped?.deduped) ?? 0;

    const topItems = Array.isArray(result.topItems) ? result.topItems : [];
    const firstTopItem = asObject(topItems[0]);
    const topScore = asNumber(firstTopItem?.rankScore);
    if (topScore != null) {
      topRankScoreSum += topScore;
      topRankScoreCount += 1;
    }
  }

  const timeseries = Array.from(hourlyCounts.entries())
    .map(([hourIso, count]) => ({ hourIso, count }))
    .sort((a, b) => a.hourIso.localeCompare(b.hourIso));

  const topSources = Array.from(sourceCounts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))
    .slice(0, 10);

  return NextResponse.json({
    window: {
      days,
      limit,
      cutoffIso,
      rowsConsidered: rows.length,
    },
    summary: {
      cacheHitRate: rows.length ? Number((cacheHitCount / rows.length).toFixed(4)) : 0,
      degradedRate: rows.length ? Number((degradedCount / rows.length).toFixed(4)) : 0,
      avgReturnedItems: rows.length ? Number((totalReturnedItems / rows.length).toFixed(2)) : 0,
      avgAfterConfidenceGate: rows.length ? Number((totalAfterConfidenceGate / rows.length).toFixed(2)) : 0,
      droppedNotPlaceBacked,
      droppedLowConfidence,
      droppedDeduped,
      avgTopRankScore: topRankScoreCount ? Number((topRankScoreSum / topRankScoreCount).toFixed(4)) : null,
    },
    topSources,
    timeseries,
  });
}
