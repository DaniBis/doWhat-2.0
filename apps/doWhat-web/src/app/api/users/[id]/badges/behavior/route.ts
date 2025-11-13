import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recordBehaviorMetrics } from '@/lib/badges';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = createClient();
  const { data: u } = await auth.auth.getUser();
  if (!u?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (u.user.id !== params.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = db();
  const payload = await req.json();
  await recordBehaviorMetrics(supabase, params.id, payload || {});
  return NextResponse.json({ ok: true });
}
