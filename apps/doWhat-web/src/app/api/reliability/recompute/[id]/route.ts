import { NextResponse, NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { aggregateMetricsForUser } from '@/lib/reliabilityAggregate';

// POST /api/reliability/recompute/:id  (admin / cron protected by CRON_SECRET header)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const secret = req.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const supabase = createServiceClient();
  const userId = params.id;
  try {
    const result = await aggregateMetricsForUser(supabase, userId);
    return NextResponse.json({ ok: true, score: result.score, confidence: result.confidence });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
