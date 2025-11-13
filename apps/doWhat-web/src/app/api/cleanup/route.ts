import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface SessionIdRow { id: string }

// GET /api/cleanup?scope=old|upcoming
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const scope = url.searchParams.get('scope') || 'old';
    const supabase = createClient();

    if (scope === 'upcoming') {
      // Delete future sessions and related RSVPs first to avoid FKs
      const nowIso = new Date().toISOString();
  const { data: victimIds } = await supabase
        .from('sessions')
        .select('id')
        .gte('starts_at', nowIso);
  const ids = (victimIds ?? []).map(r => (r as SessionIdRow).id);
      if (ids.length) {
        await supabase.from('rsvps').delete().in('session_id', ids);
        await supabase.from('sessions').delete().in('id', ids);
      }
    } else {
      // Delete old sessions (before today)
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('sessions')
        .delete()
        .lt('starts_at', today + 'T00:00:00');
    }

    const { count } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({ message: `Cleanup scope=${scope} done`, current_sessions: count });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
