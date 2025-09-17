import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recomputeUserTraits } from '@/lib/traits';

interface ProfileIdRow { id: string }

// POST /api/traits/recompute/all?limit=50&offset=0
// Requires secret (header: x-cron-secret or query param cron_secret) == process.env.CRON_SECRET
// Processes a batch of users (from profiles table) recomputing trait scores.
// Use external scheduler to call repeatedly with increasing offset until fewer than limit returned.

export const dynamic = 'force-dynamic';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const qpSecret = url.searchParams.get('cron_secret');
  const headerSecret = req.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || (process.env.CRON_SECRET !== qpSecret && process.env.CRON_SECRET !== headerSecret)) {
    return unauthorized();
  }

  const limit = Math.min( parseInt(url.searchParams.get('limit') || '50', 10) || 50, 250);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;

  const supabase = createClient();
  const started = Date.now();
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id')
    .range(offset, offset + limit - 1);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const ids = (users || []).map(u => (u as ProfileIdRow).id).filter(Boolean);
  let processed = 0;
  const errors: { userId: string; error: string }[] = [];
  for (const id of ids) {
    try {
      await recomputeUserTraits(id);
      processed++;
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || String(e);
      errors.push({ userId: id, error: msg });
    }
  }
  const durationMs = Date.now() - started;
  return NextResponse.json({ ok: errors.length === 0, batch: { limit, offset, returned: ids.length }, processed, errors, durationMs });
}
