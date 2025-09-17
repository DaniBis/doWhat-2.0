import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ProfileUser } from '@/types/profile';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const userId = params.id;
  // Attempt real user fetch
  const { data, error } = await supabase.from('users').select('id,email,raw_user_meta_data').eq('id', userId).maybeSingle();
  if (error || !data) {
    // Mock fallback
    const mock: ProfileUser = {
      id: userId,
      name: 'Guest User',
      email: 'user@example.com',
      location: 'Unknown',
      bio: 'This is a mock profile. Real data unavailable.'
    };
    return NextResponse.json(mock);
  }
  const meta = (data as any).raw_user_meta_data || {};
  // Fetch extended profile row (preferred authoritative values)
  const { data: profileRow } = await supabase
    .from('profiles')
  .select('full_name, avatar_url, bio, location, instagram, whatsapp')
    .eq('id', userId)
    .maybeSingle();

  const profile: ProfileUser = {
    id: data.id,
    name: profileRow?.full_name || meta.full_name || meta.name || 'User',
    email: data.email,
    location: profileRow?.location || meta.location || undefined,
    avatarUrl: profileRow?.avatar_url || meta.avatar_url || undefined,
    bio: profileRow?.bio || meta.bio || undefined,
    socials: profileRow ? {
      instagram: (profileRow as any).instagram || undefined,
      whatsapp: (profileRow as any).whatsapp || undefined,
    } : undefined,
  };
  return NextResponse.json(profile);
}
