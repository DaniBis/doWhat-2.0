import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface SessionIdRow { id: string }

const parseAllowList = (): string[] =>
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
    .split(/[ ,]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

// GET /api/cleanup?scope=old|upcoming
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const scope = url.searchParams.get('scope') || 'old';
    const supabase = createClient();
    const allowList = parseAllowList();

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    const actorEmail = authData?.user?.email?.toLowerCase() ?? null;
    if (!actorEmail || !allowList.includes(actorEmail)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    let deletedSessions = 0;

    if (scope === 'upcoming') {
      // Delete future sessions and related attendees first to avoid FKs
      const nowIso = new Date().toISOString();
      const { data: victimIds } = await supabase
        .from('sessions')
        .select('id')
        .gte('starts_at', nowIso);
      const ids = (victimIds ?? []).map((r) => (r as SessionIdRow).id);
      if (ids.length) {
        await supabase.from('session_attendees').delete().in('session_id', ids);
        const { error: deleteError } = await supabase.from('sessions').delete().in('id', ids);
        if (deleteError) throw deleteError;
      }
      deletedSessions = ids.length;
    } else {
      // Delete old sessions (before today)
      const today = new Date().toISOString().split('T')[0];
      const { data: deletedRows, error: oldDeleteError } = await supabase
        .from('sessions')
        .delete()
        .lt('starts_at', today + 'T00:00:00')
        .select('id');
      if (oldDeleteError) throw oldDeleteError;
      deletedSessions = deletedRows?.length ?? 0;
    }

    if (deletedSessions > 0) {
      await supabase.from('admin_audit_logs').insert({
        actor_email: actorEmail,
        action: 'cleanup_sessions',
        entity_type: 'session_batch',
        entity_id: null,
        reason: scope,
        details: {
          scope,
          deleted_sessions: deletedSessions,
        },
      });
    }

    const { count } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({ message: `Cleanup scope=${scope} done`, deleted_sessions: deletedSessions, current_sessions: count });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
