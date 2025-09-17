import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserTraits, TraitScore } from '@/lib/traits';

// GET /api/traits/:id -> owner-only
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const auth = createClient();
  const { data: u } = await auth.auth.getUser();
  if (!u?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (u.user.id !== params.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const traits: TraitScore[] = await getUserTraits(params.id);
    return NextResponse.json({ traits });
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message || String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
