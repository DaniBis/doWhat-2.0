import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Simple authenticated update route for name/avatar fields.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user || auth.user.id !== params.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(()=> ({}));
  const update: any = { id: params.id, updated_at: new Date().toISOString() };
  if (typeof body.name === 'string') update.full_name = body.name.slice(0, 120);
  if (typeof body.avatarUrl === 'string') update.avatar_url = body.avatarUrl;
  if (typeof body.location === 'string') update.location = body.location.slice(0,120);
  if (body.socials && typeof body.socials === 'object') {
    const { instagram, whatsapp } = body.socials as Record<string,string>;
    if (typeof instagram === 'string') update.instagram = instagram.slice(0,50);
    if (typeof whatsapp === 'string') update.whatsapp = whatsapp.slice(0,20); // E.164 max 16 incl +, generous cap
  }
  const { error } = await supabase.from('profiles').upsert(update, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
