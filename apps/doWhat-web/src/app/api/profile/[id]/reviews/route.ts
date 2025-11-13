import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const summary = url.searchParams.get('summary');
  const userId = params.id;
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('stars,tags')
      .eq('reviewee_id', userId)
      .limit(500);
    if (error) throw error;
    const stars = (data || []).map(r => r.stars as number);
    const avg = stars.length ? stars.reduce((a,b)=>a+b,0)/stars.length : undefined;
    const tagsCount: Record<string, number> = {};
    (data || []).forEach(r => {
      (r.tags as string[] | null)?.forEach(t => { tagsCount[t] = (tagsCount[t]||0)+1; });
    });
    return NextResponse.json({ avg, count: stars.length, tags: tagsCount });
  } catch {
    if (summary) return NextResponse.json({ avg: undefined, count: 0, tags: {} });
    return NextResponse.json({ avg: undefined, count: 0, tags: {} });
  }
}
