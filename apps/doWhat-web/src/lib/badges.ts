import { BADGE_VERIFICATION_THRESHOLD_DEFAULT } from '@dowhat/shared';

// Local light-weight row shapes (avoid drifting from DB; keep minimal fields we touch)
interface BadgeRow { id: string; code: string; }
interface UserBadgeRow { id: string; user_id: string; badge_id: string; status: string; verified_at?: string | null }
interface BadgeEndorsementCount { endorsements: number }
interface BadgeMetricsRow { events_attended?: number | null; categories_tried?: number | null; events_on_time?: number | null }

type SB = ReturnType<typeof import('./supabase/server').createClient>;

export async function findBadgeByCode(supabase: SB, code: string): Promise<BadgeRow | null> {
  const { data } = await supabase
    .from('badges')
    .select('id,code')
    .eq('code', code)
    .maybeSingle<BadgeRow>();
  return (data as BadgeRow | null) || null;
}

export async function ensureUserBadge(
  supabase: SB,
  userId: string,
  badgeCode: string,
  source: 'endorsement' | 'activity' | 'behavior' | 'admin' | 'seasonal' = 'activity'
): Promise<UserBadgeRow> {
  const badge = await findBadgeByCode(supabase, badgeCode);
  if (!badge) throw new Error(`Unknown badge code: ${badgeCode}`);

  const { data: existing } = await supabase
    .from('user_badges')
    .select('id,user_id,badge_id,status,verified_at')
    .eq('user_id', userId)
    .eq('badge_id', badge.id)
    .maybeSingle<UserBadgeRow>();

  if (existing) return existing as UserBadgeRow;
  const { data, error } = await supabase
    .from('user_badges')
    .insert({ user_id: userId, badge_id: badge.id, status: 'unverified', source })
    .select('id,user_id,badge_id,status,verified_at')
    .single<UserBadgeRow>();
  if (error) throw error;
  return data as UserBadgeRow;
}

export async function verifyByEndorsements(
  supabase: SB,
  userId: string,
  badgeCode: string,
  threshold = BADGE_VERIFICATION_THRESHOLD_DEFAULT
): Promise<boolean> {
  const badge = await findBadgeByCode(supabase, badgeCode);
  if (!badge) throw new Error(`Unknown badge code: ${badgeCode}`);

  const { data: cnt } = await supabase
    .from('v_badge_endorsement_counts')
    .select('endorsements')
    .eq('user_id', userId)
    .eq('badge_id', badge.id)
    .maybeSingle<BadgeEndorsementCount>();

  const endorsements = (cnt as BadgeEndorsementCount | null)?.endorsements ?? 0;
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
): Promise<void> {
  const { data: existing } = await supabase
    .from('user_badge_metrics')
    .select('events_attended,categories_tried')
    .eq('user_id', userId)
    .maybeSingle<BadgeMetricsRow>();

  const patch: BadgeMetricsRow & { updated_at: string } = { updated_at: new Date().toISOString() };
  if (delta.events_attended)
    patch.events_attended = ((existing as BadgeMetricsRow | null)?.events_attended || 0) + delta.events_attended;
  if (delta.categories_tried)
    patch.categories_tried = ((existing as BadgeMetricsRow | null)?.categories_tried || 0) + delta.categories_tried;

  if (existing) {
    await supabase.from('user_badge_metrics').update(patch).eq('user_id', userId);
  } else {
    await supabase.from('user_badge_metrics').insert({ user_id: userId, ...patch });
  }

  // Auto awards
  const existingEventsAttended = (existing as BadgeMetricsRow | null)?.events_attended || 0;
  const existingCategoriesTried = (existing as BadgeMetricsRow | null)?.categories_tried || 0;
  if ((patch.events_attended ?? existingEventsAttended) >= 5) {
    await ensureUserBadge(supabase, userId, 'consistent', 'activity');
  }
  if ((patch.categories_tried ?? existingCategoriesTried) >= 3) {
    await ensureUserBadge(supabase, userId, 'curious_explorer', 'activity');
  }
}

export async function recordBehaviorMetrics(
  supabase: SB,
  userId: string,
  delta: Partial<{ events_on_time: number }>
): Promise<void> {
  const { data: existing } = await supabase
    .from('user_badge_metrics')
    .select('events_on_time')
    .eq('user_id', userId)
    .maybeSingle<BadgeMetricsRow>();

  const patch: BadgeMetricsRow & { updated_at: string } = { updated_at: new Date().toISOString() };
  if (delta.events_on_time)
    patch.events_on_time = ((existing as BadgeMetricsRow | null)?.events_on_time || 0) + delta.events_on_time;

  if (existing) {
    await supabase.from('user_badge_metrics').update(patch).eq('user_id', userId);
  } else {
    await supabase.from('user_badge_metrics').insert({ user_id: userId, ...patch });
  }

  const existingOnTime = (existing as BadgeMetricsRow | null)?.events_on_time || 0;
  if ((patch.events_on_time ?? existingOnTime) >= 5) {
    await ensureUserBadge(supabase, userId, 'reliable', 'behavior');
  }
}
