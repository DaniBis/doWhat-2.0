import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserTraits } from '@/lib/traits';

// GET /api/traits/:id -> owner-only
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const auth = createClient();
  const { data: u } = await auth.auth.getUser();
  if (!u?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (u.user.id !== params.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const traits = await getUserTraits(params.id).catch((e) => {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  });
  if ((traits as any)?.json) return traits as any; // error case already formatted
  return NextResponse.json({ traits });
}
