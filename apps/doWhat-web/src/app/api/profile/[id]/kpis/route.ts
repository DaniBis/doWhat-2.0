import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { KPI } from '@/types/profile';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = params.id;
  const supabase = createClient();
  try {
    const [sessionsHosted, sessionsGoing, attendanceUpdates] = await Promise.all([
      supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('host_user_id', userId),
      supabase
        .from('session_attendees')
        .select('session_id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'going'),
      supabase.from('session_attendees').select('session_id', { count: 'exact', head: true }).eq('user_id', userId)
    ]);
    const kpis: KPI[] = [
      { label: 'Sessions Hosted', value: sessionsHosted.count || 0 },
      { label: 'Sessions Going', value: sessionsGoing.count || 0 },
      { label: 'Attendance Updates', value: attendanceUpdates.count || 0 }
    ];
    return NextResponse.json(kpis);
  } catch {
    // Mock fallback
    const mock: KPI[] = [
      { label: 'Sessions Hosted', value: 0 },
      { label: 'Sessions Going', value: 0 },
      { label: 'Attendance Updates', value: 0 }
    ];
    return NextResponse.json(mock);
  }
}
