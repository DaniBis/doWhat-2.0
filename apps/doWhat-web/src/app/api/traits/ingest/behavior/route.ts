import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ingestBehaviorSignals, recomputeUserTraits } from '@/lib/traits';
import { rateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const auth = createClient();
  const { data: u } = await auth.auth.getUser();
  if (!u?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = u.user.id;

  // Limit behavior ingestion bursts: 30 per hour
  if (!rateLimit(`behavior:${userId}`, { capacity: 30, intervalMs: 60 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Rate limit' }, { status: 429 });
  }
  const payload = await req.json();
  await ingestBehaviorSignals(userId, payload || {});
  await recomputeUserTraits(userId);
  return NextResponse.json({ ok: true });
}
