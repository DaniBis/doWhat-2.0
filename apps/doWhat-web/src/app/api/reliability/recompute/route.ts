import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { listActiveUserIds, aggregateMetricsForUser } from '@/lib/reliabilityAggregate';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

// POST /api/reliability/recompute  (batch)  headers: x-cron-secret
// Optional query params: limit, offset, days
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const supabase = createServiceClient();
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 25), 200);
  const offset = Number(url.searchParams.get('offset') || 0);
  const days = Math.min(Number(url.searchParams.get('days') || 90), 365);
  try {
    const userIds = await listActiveUserIds(supabase, days, limit, offset);
    const results: Array<{ user_id: string; score?: number; confidence?: number; error?: string }> = [];
    for (const id of userIds) {
      try {
        const r = await aggregateMetricsForUser(supabase, id);
        results.push({ user_id: id, score: r.score, confidence: r.confidence });
      } catch (error: unknown) {
        results.push({ user_id: id, error: getErrorMessage(error) });
      }
    }
    return NextResponse.json({ count: results.length, results });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
