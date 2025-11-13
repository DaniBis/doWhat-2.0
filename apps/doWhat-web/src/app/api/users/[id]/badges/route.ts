import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';

interface UserBadgeJoinedRow {
  id: string;
  user_id: string;
  badge_id: string;
  status: string;
  source?: string | null;
  created_at: string;
  verified_at?: string | null;
  expiry_date?: string | null;
  badges: Record<string, unknown> | null;
  v_badge_endorsement_counts?: { endorsements?: number } | null;
}

interface PublicBadgeRow {
  id: string;
  user_id: string;
  badge_id: string;
  status: string;
  source?: string | null;
  created_at: string;
  verified_at?: string | null;
  expiry_date?: string | null;
  badges: Record<string, unknown> | null;
  endorsements: number;
}

// GET /api/users/:id/badges
// Owner: all badges
// Non-owner: only verified (and whatever RLS allows). Still returns endorsement counts.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = createClient();
  const { data: u } = await auth.auth.getUser();
  if (!u?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = db();
  const userId = params.id;
  const isOwner = u.user.id === userId;

  let query = supabase
    .from('user_badges')
    .select('*, badges(*), v_badge_endorsement_counts!left(endorsements)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!isOwner) {
    // Only show verified to others
    query = query.eq('status', 'verified');
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows: UserBadgeJoinedRow[] = (data as unknown as UserBadgeJoinedRow[]) || [];
  const sanitized: PublicBadgeRow[] = rows.map(ub => ({
    id: ub.id,
    user_id: ub.user_id,
    badge_id: ub.badge_id,
    status: ub.status,
    source: isOwner ? ub.source : undefined,
    created_at: ub.created_at,
    verified_at: ub.verified_at,
    expiry_date: ub.expiry_date,
    badges: ub.badges,
    endorsements: ub.v_badge_endorsement_counts?.endorsements ?? 0,
  }));

  return NextResponse.json({ badges: sanitized, owner: isOwner }, { headers: { 'Cache-Control': isOwner ? 'private, max-age=10' : 'public, max-age=30' } });
}
