import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Trait } from '@/types/profile';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const top = Math.min(Number(url.searchParams.get('top') || 6), 24);
  const userId = params.id;
  const supabase = createClient();
  // No real traits domain yet: derive synthetic traits from reliability metrics / index.
  try {
    const { data: idx } = await supabase
      .from('reliability_index')
      .select('components_json')
      .eq('user_id', userId)
      .maybeSingle();
    const c = (idx?.components_json as any) || {};
    const traits: Trait[] = [
      { id: 'attendance_30', name: 'Attendance (30d)', score: c.AS_30 || 0, confidence: 0.7, category: 'engagement' },
      { id: 'attendance_90', name: 'Attendance (90d)', score: c.AS_90 || 0, confidence: 0.7, category: 'engagement' },
      { id: 'punctuality', name: 'Punctuality', score: (c.punctuality_30 || c.punctuality_90 || 0)*100, confidence: 0.5, category: 'behavior' },
      { id: 'hosting', name: 'Hosting', score: (c.host_bonus ? Math.min(100, c.host_bonus * 20) : 0), confidence: 0.4, category: 'leadership' },
      { id: 'reviews', name: 'Reviews', score: (c.RS || 0), confidence: 0.6, category: 'social' },
      { id: 'consistency', name: 'Consistency', score: Math.round(((c.AS_30||0)+(c.AS_90||0))/2), confidence: 0.6, category: 'stability' }
    ].slice(0, top);
    return NextResponse.json(traits);
  } catch {
    const mock: Trait[] = Array.from({ length: top }).map((_, i) => ({
      id: 't'+i,
      name: 'Trait '+(i+1),
      score: 50,
      confidence: 0.5,
      category: 'general'
    }));
    return NextResponse.json(mock);
  }
}
