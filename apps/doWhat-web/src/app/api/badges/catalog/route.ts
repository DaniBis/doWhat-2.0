import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';

// Basic shapes for rows we touch. We only rely on a small subset of columns so keep them minimal.
interface BadgeRow {
  id: string;
  category?: string;
  tier?: number;
  // Allow other columns without using 'any'
  [key: string]: unknown;
}

interface UserBadgeRow {
  id: string;
  badge_id: string;
  status: string;
  source?: string | null;
  verified_at?: string | null;
  expiry_date?: string | null;
  created_at: string;
  [key: string]: unknown;
}

interface MergedBadge {
  catalog: BadgeRow;
  owned: UserBadgeRow | null;
}

// GET /api/badges/catalog -> list all badges + current user ownership (if signed in)
export async function GET() {
  const auth = createClient();
  const { data: u } = await auth.auth.getUser();
  const uid = u?.user?.id;
  const supabase = db();
  const { data: catalog, error } = await supabase.from('badges').select('*').order('category').order('tier', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!uid) return NextResponse.json({ badges: catalog as BadgeRow[] }, { headers: { 'Cache-Control': 'public, max-age=60' } });
  const { data: owned } = await supabase
    .from('user_badges')
    .select('id, badge_id, status, source, verified_at, expiry_date, created_at')
    .eq('user_id', uid);
  const ownedMap = new Map<string, UserBadgeRow>((owned || []).map(o => [ (o as UserBadgeRow).badge_id, o as UserBadgeRow ]));
  const merged: MergedBadge[] = (catalog as BadgeRow[] | null || []).map(b => ({
    catalog: b,
    owned: ownedMap.get(b.id) || null,
  }));
  return NextResponse.json({ badges: merged }, { headers: { 'Cache-Control': 'private, max-age=30' } });
}
