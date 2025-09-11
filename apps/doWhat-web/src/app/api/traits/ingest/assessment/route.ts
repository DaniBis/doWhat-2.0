import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ingestAssessment, recomputeUserTraits } from '@/lib/traits';

export async function POST(req: NextRequest) {
  const auth = createClient();
  const { data: u } = await auth.auth.getUser();
  if (!u?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = u.user.id;

  const payload = await req.json();
  const inputs = payload?.inputs || {};
  await ingestAssessment(userId, inputs);
  await recomputeUserTraits(userId);
  return NextResponse.json({ ok: true });
}
