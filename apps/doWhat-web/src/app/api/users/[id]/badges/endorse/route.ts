import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';
import { BADGE_VERIFICATION_THRESHOLD_DEFAULT } from '@dowhat/shared';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = db();
  const auth = createClient();
  const { data: u } = await auth.auth.getUser();
  const endorserId = u?.user?.id;
  if (!endorserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const targetId = params.id;
  const { badge_id, threshold } = await req.json();
  const verifyThreshold = Number.isFinite(threshold) ? Math.max(1, threshold) : BADGE_VERIFICATION_THRESHOLD_DEFAULT;

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

  return NextResponse.json({ ok: true, endorsements, verified: endorsements >= verifyThreshold });
}
