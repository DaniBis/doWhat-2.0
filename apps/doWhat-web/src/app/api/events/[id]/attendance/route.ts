import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserFromRequest } from '@/lib/auth';

// POST /api/events/:id/attendance { user_id, attendance, punctuality }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase: authClient } = await getUserFromRequest(req);
  if (!user || !authClient) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supabase = createClient();
  const payload = await req.json().catch(()=>null) || {};
  const { user_id, attendance, punctuality } = payload as { user_id?: string; attendance?: string; punctuality?: string };
  if (!user_id || !attendance) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  // Ensure caller is host of event
  const { data: ev } = await supabase.from('events').select('id,host_id').eq('id', params.id).maybeSingle();
  if (!ev || ev.host_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { error } = await supabase
    .from('event_participants')
    .upsert({ event_id: params.id, user_id, attendance, punctuality, role: user_id === ev.host_id ? 'host':'guest', updated_at: new Date().toISOString() }, { onConflict: 'event_id,user_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
