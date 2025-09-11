import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';

// GET /api/users/:id/badges -> list badges for a user (anonymized endorsement counts)
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = createClient();
  const { data: u } = await auth.auth.getUser();
  if (!u?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (u.user.id !== params.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = db();
  const userId = params.id;

  const { data, error } = await supabase
    .from('user_badges')
    .select('*, badges(*), v_badge_endorsement_counts!left(endorsements)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Strip anonymous details (we never expose endorser ids; the join only returns counts)
  const sanitized = (data || []).map((ub: any) => ({
    id: ub.id,
    user_id: ub.user_id,
    badge_id: ub.badge_id,
    status: ub.status,
    source: ub.source,
    created_at: ub.created_at,
    verified_at: ub.verified_at,
    expiry_date: ub.expiry_date,
    badges: ub.badges,
    endorsements: ub.v_badge_endorsement_counts?.endorsements ?? 0,
  }));

  return NextResponse.json({ badges: sanitized });
}
