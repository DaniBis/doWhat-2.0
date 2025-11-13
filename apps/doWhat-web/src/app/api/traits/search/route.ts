import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface TraitSearchRow {
  user_id: string;
  score_float: number;
  confidence_float: number;
  traits_catalog: { name: string; category: string } | null;
}

// GET /api/traits/search?min=70&min_conf=0.3&category=Core%20Reliability&name=Reliable
export async function GET(req: NextRequest) {
  const supabase = db();
  const { searchParams } = new URL(req.url);
  const min = Number(searchParams.get('min') || '0');
  const max = Number(searchParams.get('max') || '100');
  const minConf = Number(searchParams.get('min_conf') || '0');
  const category = searchParams.get('category');
  const name = searchParams.get('name');

  let query = supabase
    .from('user_traits')
    .select('user_id, score_float, confidence_float, traits_catalog:trait_id(name,category)')
    .gte('score_float', min)
    .lte('score_float', isFinite(max) ? max : 100)
    .gte('confidence_float', minConf);

  if (category) query = query.eq('traits_catalog.category', category);
  if (name) query = query.eq('traits_catalog.name', name);

  const { data, error } = await query.returns<TraitSearchRow[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data ?? [] });
}
