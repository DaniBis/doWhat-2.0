import { BADGE_VERIFICATION_THRESHOLD_DEFAULT } from '@dowhat/shared';

type SB = ReturnType<typeof import('./supabase/server').createClient>;

export async function findBadgeByCode(supabase: SB, code: string) {
  const { data } = await supabase.from('badges').select('*').eq('code', code).maybeSingle();
  return data || null;
}

export async function ensureUserBadge(
  supabase: SB,
  userId: string,
  badgeCode: string,
  source: 'endorsement' | 'activity' | 'behavior' | 'admin' | 'seasonal' = 'activity'
) {
  const badge = await findBadgeByCode(supabase, badgeCode);
  if (!badge) throw new Error(`Unknown badge code: ${badgeCode}`);

  const { data: existing } = await supabase
    .from('user_badges')
    .select('*')
    .eq('user_id', userId)
    .eq('badge_id', badge.id)
    .maybeSingle();

  if (existing) return existing;
  const { data, error } = await supabase
    .from('user_badges')
    .insert({ user_id: userId, badge_id: badge.id, status: 'unverified', source })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function verifyByEndorsements(
  supabase: SB,
  userId: string,
  badgeCode: string,
  threshold = BADGE_VERIFICATION_THRESHOLD_DEFAULT
) {
  const badge = await findBadgeByCode(supabase, badgeCode);
  if (!badge) throw new Error(`Unknown badge code: ${badgeCode}`);

  const { data: cnt } = await supabase
    .from('v_badge_endorsement_counts')
    .select('endorsements')
    .eq('user_id', userId)
    .eq('badge_id', badge.id)
    .maybeSingle();

  const endorsements = cnt?.endorsements ?? 0;
  if (endorsements >= threshold) {
    await supabase
      .from('user_badges')
      .update({ status: 'verified', verified_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('badge_id', badge.id);
    return true;
  }
  return false;
}

export async function recordActivityMetrics(
  supabase: SB,
  userId: string,
  delta: Partial<{ events_attended: number; categories_tried: number }>
) {
  const { data: existing } = await supabase
    .from('user_badge_metrics')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const patch: any = { updated_at: new Date().toISOString() };
  if (delta.events_attended) patch.events_attended = (existing?.events_attended || 0) + delta.events_attended;
  if (delta.categories_tried) patch.categories_tried = (existing?.categories_tried || 0) + delta.categories_tried;

  if (existing) {
    await supabase.from('user_badge_metrics').update(patch).eq('user_id', userId);
  } else {
    await supabase.from('user_badge_metrics').insert({ user_id: userId, ...patch });
  }

  // Auto awards
  if ((patch.events_attended ?? existing?.events_attended) >= 5) {
    await ensureUserBadge(supabase, userId, 'consistent', 'activity');
  }
  if ((patch.categories_tried ?? existing?.categories_tried) >= 3) {
    await ensureUserBadge(supabase, userId, 'curious_explorer', 'activity');
  }
}

export async function recordBehaviorMetrics(
  supabase: SB,
  userId: string,
  delta: Partial<{ events_on_time: number }>
) {
  const { data: existing } = await supabase
    .from('user_badge_metrics')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const patch: any = { updated_at: new Date().toISOString() };
  if (delta.events_on_time) patch.events_on_time = (existing?.events_on_time || 0) + delta.events_on_time;

  if (existing) {
    await supabase.from('user_badge_metrics').update(patch).eq('user_id', userId);
  } else {
    await supabase.from('user_badge_metrics').insert({ user_id: userId, ...patch });
  }

  if ((patch.events_on_time ?? existing?.events_on_time) >= 5) {
    await ensureUserBadge(supabase, userId, 'reliable', 'behavior');
  }
}
