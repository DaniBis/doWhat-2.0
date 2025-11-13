import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { findBadgeByCode, ensureUserBadge } from '@/lib/badges';
import { createClient } from '@/lib/supabase/server';

function isAdmin(email?: string | null) {
  if (!email) return false;
  return /@dowhat\.(dev|app)$/.test(email) || email === 'admin@dowhat.local';
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = createClient();
  const { data: u } = await auth.auth.getUser();
  if (!isAdmin(u?.user?.email ?? null)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = db();
  const { badge_code, expire, expiry_date } = await req.json();
  const badge = await findBadgeByCode(supabase, badge_code);
  if (!badge) return NextResponse.json({ error: 'Unknown badge' }, { status: 400 });

  if (expire) {
    await supabase
      .from('user_badges')
      .update({ status: 'expired', expiry_date: expiry_date ?? new Date().toISOString() })
      .eq('user_id', params.id)
      .eq('badge_id', badge.id);
    return NextResponse.json({ ok: true, status: 'expired' });
  }

  await ensureUserBadge(supabase, params.id, badge.code, 'admin');
  await supabase
    .from('user_badges')
    .update({ status: 'verified', verified_at: new Date().toISOString() })
    .eq('user_id', params.id)
    .eq('badge_id', badge.id);

  return NextResponse.json({ ok: true, status: 'verified' });
}
