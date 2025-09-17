import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { listActiveUserIds, aggregateMetricsForUser } from '@/lib/reliabilityAggregate';

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
    const results: any[] = [];
    for (const id of userIds) {
      try {
        const r = await aggregateMetricsForUser(supabase, id);
        results.push({ user_id: id, score: r.score, confidence: r.confidence });
      } catch (e: any) {
        results.push({ user_id: id, error: e.message });
      }
    }
    return NextResponse.json({ count: results.length, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
