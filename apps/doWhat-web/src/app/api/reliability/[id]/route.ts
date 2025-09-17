import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/reliability/:id
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const userId = params.id;
  const { data: idx } = await supabase
    .from('reliability_index')
    .select('user_id,score,confidence,components_json,last_recomputed')
    .eq('user_id', userId)
    .maybeSingle();
  const { data: metrics } = await supabase
    .from('reliability_metrics')
    .select('window_30d_json,window_90d_json')
    .eq('user_id', userId)
    .maybeSingle();
  if (!idx) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({
    user_id: idx.user_id,
    score: Number(idx.score),
    confidence: Number(idx.confidence),
    components: idx.components_json || {},
    metrics_30d: metrics?.window_30d_json || {},
    metrics_90d: metrics?.window_90d_json || {},
    updated_at: idx.last_recomputed
  });
}
