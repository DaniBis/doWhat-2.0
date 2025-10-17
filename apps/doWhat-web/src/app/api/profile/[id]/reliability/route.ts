import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Reliability, AttendanceMetrics } from '@/types/profile';
import type { ReliabilityComponentsBreakdown, ReliabilityMetricsWindow } from '@dowhat/shared';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = params.id;
  const supabase = createClient();
  try {
    const { data: idx } = await supabase
      .from('reliability_index')
      .select('score,confidence,components_json')
      .eq('user_id', userId)
      .maybeSingle<{ score: number | null; confidence: number | null; components_json: ReliabilityComponentsBreakdown | null }>();
    const { data: metrics } = await supabase
      .from('reliability_metrics')
      .select('window_30d_json,window_90d_json')
      .eq('user_id', userId)
      .maybeSingle<{ window_30d_json: ReliabilityMetricsWindow | null; window_90d_json: ReliabilityMetricsWindow | null }>();
    const w30 = metrics?.window_30d_json ?? {};
    const w90 = metrics?.window_90d_json ?? {};
    const attendance: AttendanceMetrics = {
      attended30: w30.attended || 0,
      noShow30: w30.no_shows || 0,
      lateCancel30: w30.late_cancels || 0,
      excused30: w30.excused || 0,
      attended90: w90.attended || 0,
      noShow90: w90.no_shows || 0,
      lateCancel90: w90.late_cancels || 0,
      excused90: w90.excused || 0,
    };
    const components = idx?.components_json ?? {};
    const reliability: Reliability = {
      score: Number(idx?.score || 0),
      confidence: Number(idx?.confidence || 0),
      components: {
        AS30: components.AS_30 || 0,
        AS90: components.AS_90 || 0,
        reviewScore: components.RS || undefined,
        hostBonus: components.host_bonus || undefined
      }
    };
    return NextResponse.json({ reliability, attendance });
  } catch {
    const reliability: Reliability = { score: 0, confidence: 0, components: { AS30: 0, AS90: 0 } };
    const attendance: AttendanceMetrics = { attended30:0,noShow30:0,lateCancel30:0,excused30:0,attended90:0,noShow90:0,lateCancel90:0,excused90:0 };
    return NextResponse.json({ reliability, attendance });
  }
}
