import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';

// GET /api/traits/sources/:id -> raw sources for a trait for the authenticated user (owner only)
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const auth = createClient();
  const { data: u } = await auth.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = db();
  // gather events
  const { data: events } = await supabase
    .from('trait_events')
    .select('occurred_at, delta, weight, source_type, metadata')
    .eq('user_id', userId)
    .eq('trait_id', params.id)
    .order('occurred_at', { ascending: false })
    .limit(100);
  const { data: peers } = await supabase
    .from('v_trait_peer_agreement_counts')
    .select('*')
    .eq('user_id', userId)
    .eq('trait_id', params.id)
    .maybeSingle();
  return NextResponse.json({ events: events || [], peer_agreements: peers?.agreements || 0 });
}
