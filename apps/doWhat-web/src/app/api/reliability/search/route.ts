import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/reliability/search?min_score=&min_confidence=&limit=
export async function GET(req: Request) {
  const supabase = createClient();
  const url = new URL(req.url);
  const minScore = Number(url.searchParams.get('min_score') || 0);
  const minConf = Number(url.searchParams.get('min_confidence') || 0);
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
  const query = supabase
    .from('reliability_index')
    .select('user_id,score,confidence,components_json,last_recomputed')
    .gte('score', minScore)
    .gte('confidence', minConf)
    .order('score', { ascending: false })
    .limit(limit);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data?.map(r => ({
    user_id: r.user_id,
    score: Number(r.score),
    confidence: Number(r.confidence),
    updated_at: r.last_recomputed
  })) || [] });
}
