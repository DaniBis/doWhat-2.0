import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recomputeUserTraits, getUserTraits } from '@/lib/traits';

// POST /api/traits/recompute/self -> recompute traits for authenticated user (non-batch)
export async function POST(req: NextRequest) {
  const auth = createClient();
  const { data: u } = await auth.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
  const url = new URL(req.url);
  const detail = url.searchParams.get('detail') === '1';
  await recomputeUserTraits(userId);
  if (!detail) return NextResponse.json({ ok: true });
  const traits = await getUserTraits(userId);
  return NextResponse.json({ ok: true, traits });
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message || 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
