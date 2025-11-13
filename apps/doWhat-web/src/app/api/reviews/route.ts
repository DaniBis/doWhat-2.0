import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserFromRequest } from '@/lib/auth';

// POST /api/reviews { event_id, reviewee_id, stars, tags, comment }
export async function POST(req: NextRequest) {
  const { user } = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supabase = createClient();
  const body = await req.json().catch(()=>null) || {};
  const { event_id, reviewee_id, stars, tags, comment } = body as { event_id?: string; reviewee_id?: string; stars?: number; tags?: string[]; comment?: string };
  if (!event_id || !reviewee_id || !stars) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  if (stars < 1 || stars > 5) return NextResponse.json({ error: 'invalid_stars' }, { status: 400 });
  // Validate reviewer participated in event
  const { data: participant } = await supabase
    .from('event_participants')
    .select('event_id')
    .eq('event_id', event_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!participant) return NextResponse.json({ error: 'not_participant' }, { status: 403 });
  const { error } = await supabase.from('reviews').upsert({ event_id, reviewer_id: user.id, reviewee_id, stars, tags, comment }, { onConflict: 'event_id,reviewer_id,reviewee_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
