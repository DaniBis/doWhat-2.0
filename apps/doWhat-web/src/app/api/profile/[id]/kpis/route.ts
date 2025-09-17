import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { KPI } from '@/types/profile';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = params.id;
  const supabase = createClient();
  try {
    const [eventsCreated, attended, totalRsvps] = await Promise.all([
      supabase.from('events').select('id', { count: 'exact', head: true }).eq('host_id', userId),
      supabase.from('event_participants').select('event_id', { count: 'exact', head: true }).eq('user_id', userId).eq('attendance','attended'),
      supabase.from('event_participants').select('event_id', { count: 'exact', head: true }).eq('user_id', userId)
    ]);
    const kpis: KPI[] = [
      { label: 'Events Created', value: eventsCreated.count || 0 },
      { label: 'Events Attended', value: attended.count || 0 },
      { label: 'Total RSVPs', value: totalRsvps.count || 0 }
    ];
    return NextResponse.json(kpis);
  } catch {
    // Mock fallback
    const mock: KPI[] = [
      { label: 'Events Created', value: 0 },
      { label: 'Events Attended', value: 0 },
      { label: 'Total RSVPs', value: 0 }
    ];
    return NextResponse.json(mock);
  }
}
