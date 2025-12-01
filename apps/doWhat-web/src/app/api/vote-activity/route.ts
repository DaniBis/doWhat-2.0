import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getUserFromRequest } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';
import { isActivityName } from '@/lib/venues/search';

const VOTE_RATE_LIMIT = { capacity: 40, intervalMs: 60_000 };

export async function POST(req: NextRequest) {
  const { user } = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!rateLimit(`vote:${user.id}`, VOTE_RATE_LIMIT)) {
    return NextResponse.json({ error: 'Too many votes, please slow down.' }, { status: 429 });
  }

  const payload = (await readBody(req)) ?? {};
  const venueId = typeof payload.venueId === 'string' ? payload.venueId.trim() : '';
  const activityNameRaw =
    typeof payload.activityName === 'string' ? payload.activityName : payload.activity;
  const activityName = typeof activityNameRaw === 'string' ? activityNameRaw.trim() : '';
  const voteValue = parseBoolean(payload.vote);

  if (!venueId) {
    return NextResponse.json({ error: 'venueId is required.' }, { status: 400 });
  }
  if (!isActivityName(activityName)) {
    return NextResponse.json({ error: 'Invalid activity name.' }, { status: 400 });
  }
  if (voteValue == null) {
    return NextResponse.json({ error: 'vote must be true or false.' }, { status: 400 });
  }

  try {
    const supabase = createClient();
    const { data: voteRow, error: voteError } = await supabase
      .from('venue_activity_votes')
      .upsert(
        {
          venue_id: venueId,
          user_id: user.id,
          activity_name: activityName,
          vote: voteValue,
        },
        { onConflict: 'venue_id,user_id,activity_name' },
      )
      .select('venue_id,activity_name,vote,created_at,updated_at')
      .single();

    if (voteError) throw voteError;

    const { error: refreshError } = await supabase.rpc('refresh_verified_activities', { target_venue: venueId });
    if (refreshError) throw refreshError;

    const { data: totalsRow, error: totalsError } = await supabase
      .from('v_venue_activity_votes')
      .select('yes_votes,no_votes')
      .eq('venue_id', venueId)
      .eq('activity_name', activityName)
      .maybeSingle();
    if (totalsError) throw totalsError;

    const { data: venueRow, error: venueError } = await supabase
      .from('venues')
      .select('verified_activities,needs_verification')
      .eq('id', venueId)
      .single();
    if (venueError) throw venueError;

    return NextResponse.json({
      vote: voteRow,
      totals: {
        yes: totalsRow?.yes_votes ?? 0,
        no: totalsRow?.no_votes ?? 0,
      },
      verification: {
        verifiedActivities: Array.isArray(venueRow?.verified_activities) ? venueRow?.verified_activities : [],
        needsVerification: Boolean(venueRow?.needs_verification),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return typeof body === 'object' && body ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
  }
  return null;
}
