import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { BADGE_VERIFICATION_THRESHOLD_DEFAULT } from '@dowhat/shared';

// Simple in-memory rate bucket (best-effort per-process)
const bucket: Record<string, { count: number; ts: number }> = {};

interface EndorseBody { badge_id: string; threshold?: number }
type EndorseResponse =
  | { ok: true; endorsements: number; verified: boolean }
  | { error: string };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase: authClient } = await getUserFromRequest(req);
  const supabase = db();
  const endorserId = user?.id;
  if (!endorserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const key = endorserId;
  const now = Date.now();
  const windowMs = 60_000; // 1 min
  const limit = 20;
  const rec = bucket[key] || { count: 0, ts: now };
  if (now - rec.ts > windowMs) { rec.count = 0; rec.ts = now; }
  rec.count += 1;
  bucket[key] = rec;
  if (rec.count > limit) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
  }

  const targetId = params.id;
  if (targetId === endorserId) return NextResponse.json({ error: 'Cannot endorse yourself' }, { status: 400 });
  const body: EndorseBody = await req.json();
  const { badge_id, threshold } = body;
  const verifyThreshold = (typeof threshold === 'number' && Number.isFinite(threshold))
    ? Math.max(1, threshold)
    : BADGE_VERIFICATION_THRESHOLD_DEFAULT;

  // Insert endorsement (unique constraint prevents duplicates)
  const { error: e1 } = await supabase.from('badge_endorsements').insert({
    target_user_id: targetId,
    badge_id,
    endorser_user_id: endorserId,
  });
  if (e1 && !String(e1.message).includes('duplicate')) {
    return NextResponse.json({ error: e1.message }, { status: 400 });
  }

  // Ensure user_badges row exists
  const { data: ubRow } = await supabase.from('user_badges').select('*').eq('user_id', targetId).eq('badge_id', badge_id).maybeSingle();
  if (!ubRow) {
    await supabase.from('user_badges').insert({ user_id: targetId, badge_id, status: 'unverified', source: 'endorsement' });
  }

  // Count endorsements; verify if threshold met
  const { data: cntRow } = await supabase
    .from('v_badge_endorsement_counts')
    .select('endorsements')
    .eq('user_id', targetId)
    .eq('badge_id', badge_id)
    .maybeSingle();

  const endorsements = cntRow?.endorsements ?? 0;
  if (endorsements >= verifyThreshold) {
    await supabase
      .from('user_badges')
      .update({ status: 'verified', verified_at: new Date().toISOString() })
      .eq('user_id', targetId)
      .eq('badge_id', badge_id);
  }

  return NextResponse.json<EndorseResponse>({ ok: true, endorsements, verified: endorsements >= verifyThreshold });
}
