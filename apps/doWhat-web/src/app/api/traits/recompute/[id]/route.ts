import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recomputeUserTraits } from '@/lib/traits';

function isAdmin(email?: string | null) {
  if (!email) return false;
  return /@dowhat\.(dev|app)$/.test(email) || email === 'admin@dowhat.local';
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const auth = createClient();
  const { data: u } = await auth.auth.getUser();
  if (!u?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const isOwner = u.user.id === params.id;
  if (!isOwner && !isAdmin(u.user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await recomputeUserTraits(params.id);
  return NextResponse.json({ ok: true });
}
