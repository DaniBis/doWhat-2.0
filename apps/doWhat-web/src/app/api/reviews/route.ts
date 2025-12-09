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
  const { data: eventRow, error: eventError } = await supabase
    .from('events')
    .select('id, source_session_id')
    .eq('id', event_id)
    .maybeSingle();
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });
  if (!eventRow) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });

  const sessionId = eventRow.source_session_id ?? null;
  if (!sessionId) {
    return NextResponse.json({ error: 'session_not_migrated' }, { status: 409 });
  }

  const { count, error: attendanceError } = await supabase
    .from('session_attendees')
    .select('session_id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('user_id', user.id);
  if (attendanceError) return NextResponse.json({ error: attendanceError.message }, { status: 500 });
  const isParticipant = (count ?? 0) > 0;

  if (!isParticipant) return NextResponse.json({ error: 'not_participant' }, { status: 403 });
  const { error } = await supabase.from('reviews').upsert({ event_id, reviewer_id: user.id, reviewee_id, stars, tags, comment }, { onConflict: 'event_id,reviewer_id,reviewee_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
