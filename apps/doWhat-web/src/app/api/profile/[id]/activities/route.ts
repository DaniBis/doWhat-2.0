import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Activity } from '@/types/profile';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const range = url.searchParams.get('range') || '30d';
  const days = range === '90d' ? 90 : 30;
  const userId = params.id;
  const supabase = createClient();
  try {
    const since = new Date(Date.now() - days*86400000).toISOString();
    const { data, error } = await supabase
    .from('session_attendees')
    .select('session_id,status,updated_at,sessions(starts_at, activities(name))')
    .eq('user_id', userId)
    .gte('updated_at', since)
    .limit(100)
    .returns<Array<{ session_id: string; status: string | null; updated_at: string; sessions: { starts_at?: string | null; activities?: { name?: string | null } | null } | null }>>();
    if (error) throw error;
    const timeline: Activity[] = (data ?? []).map((r) => ({
      id: r.session_id,
      ts: r.sessions?.starts_at ?? r.updated_at,
      kind: r.status ?? 'attendance',
      label: r.sessions?.activities?.name ?? `Session ${r.session_id}`
    }));
    return NextResponse.json({ timeline });
  } catch {
    const timeline: Activity[] = Array.from({ length: 5 }).map((_, i) => ({
      id: 'e'+i,
      ts: new Date(Date.now() - i*3600000).toISOString(),
      kind: 'mock',
      label: 'Mock activity'
    }));
    return NextResponse.json({ timeline });
  }
}
