import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Badge, BadgeStatus } from '@/types/profile';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 8), 50);
  const statusFilter = url.searchParams.get('status') as BadgeStatus | null;
  const userId = params.id;
  const supabase = createClient();
  // Attempt to query a presumed badges view/table; fallback to mock if unavailable
  try {
    const { data, error } = await supabase
      .from('user_badges')
      .select('id,badge_id,name,code,status,level,earned_at,created_at,seasonal_until')
      .eq('user_id', userId)
      .limit(limit)
      .returns<Array<{
        id: string;
        badge_id?: string | null;
        name?: string | null;
        code?: string | null;
        status?: BadgeStatus | null;
        level?: number | null;
        earned_at?: string | null;
        created_at?: string | null;
        seasonal_until?: string | null;
      }>>();
    if (error) throw error;
    let badges: Badge[] = (data ?? []).map((r) => ({
      id: r.badge_id ?? r.id,
      name: r.name ?? r.code ?? 'Badge',
      status: r.status ?? 'unverified',
      level: r.level ?? undefined,
      earnedAt: r.earned_at ?? r.created_at ?? undefined,
      seasonalUntil: r.seasonal_until ?? undefined,
    }));
    if (statusFilter) badges = badges.filter(b => b.status === statusFilter);
    return NextResponse.json(badges.slice(0, limit));
  } catch {
    const mock: Badge[] = Array.from({ length: limit }).map((_, i) => ({
      id: 'b'+i,
      name: 'Badge '+(i+1),
      status: (i % 3 === 0 ? 'verified' : i % 3 === 1 ? 'unverified' : 'expired') as BadgeStatus,
      level: (i % 3) + 1,
      earnedAt: new Date(Date.now() - i*86400000).toISOString()
    })).filter(b => !statusFilter || b.status === statusFilter).slice(0, limit);
    return NextResponse.json(mock);
  }
}
