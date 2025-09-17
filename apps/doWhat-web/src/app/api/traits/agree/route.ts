import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { peerAgree, recomputeUserTraits } from '@/lib/traits';
import { rateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const auth = createClient();
  const { data: u } = await auth.auth.getUser();
  if (!u?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const endorserId = u.user.id;

  const { target_user_id, trait_id, weekly_cap } = await req.json();
  if (!target_user_id || !trait_id) {
    return NextResponse.json({ error: 'Missing target_user_id or trait_id' }, { status: 400 });
  }

  if (target_user_id === endorserId) {
    return NextResponse.json({ error: 'Cannot endorse self' }, { status: 400 });
  }

  // Rate limit peer endorsements per user (e.g., 20 per 10 minutes)
  if (!rateLimit(`agree:${endorserId}`, { capacity: 20, intervalMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Rate limit' }, { status: 429 });
  }
  const res = await peerAgree(endorserId, target_user_id, trait_id, weekly_cap ?? 5);
  if (!res.ok) return NextResponse.json(res, { status: 400 });
  await recomputeUserTraits(target_user_id);
  return NextResponse.json({ ok: true });
}
