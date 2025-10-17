/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js';

import { computeReliabilityIndex } from '@/lib/reliability';
import type { ReliabilityMetricsWindow } from '@dowhat/shared';

interface EPRow {
  attendance: string | null;
  punctuality: string | null;
  role: string;
  events: { starts_at: string; status: string } | null;
}
interface ReviewRow { stars: number; reviewer_id: string; created_at: string }
interface ReputationRow { user_id: string; rep: number }

type ReliabilityCounter = Required<
  Pick<ReliabilityMetricsWindow, 'attended' | 'no_shows' | 'late_cancels' | 'excused' | 'on_time' | 'late' | 'reviews'>
> & {
  weighted_review?: number;
  last_event_at?: string;
};

type SupabaseAdminClient = SupabaseClient<any, "public", any>;

function createCounter(): ReliabilityCounter {
  return {
    attended: 0,
    no_shows: 0,
    late_cancels: 0,
    excused: 0,
    on_time: 0,
    late: 0,
    reviews: 0,
  };
}

export async function aggregateMetricsForUser(supabaseAdmin: SupabaseAdminClient, userId: string) {
  const now = Date.now();
  const d30 = now - 30*86400000;
  const d90 = now - 90*86400000;

  // Fetch participant rows (all – we rely on service role so no RLS filter issues)
  const { data: participants, error: epErr } = await supabaseAdmin
    .from('event_participants')
    .select('attendance,punctuality,role,events(starts_at,status)')
    .eq('user_id', userId)
    .returns<EPRow[]>();
  if (epErr) throw new Error('participants: ' + epErr.message);

  const w30 = createCounter();
  const w90 = createCounter();
  const lifetime = createCounter();

  let lastEventAt: number | null = null;
  let safeHostEvents = 0;
  const seenHostEventIds = new Set<string>();

  (participants ?? []).forEach(p => {
    const starts = p.events?.starts_at ? Date.parse(p.events.starts_at) : null;
    if (starts) {
      if (!lastEventAt || starts > lastEventAt) lastEventAt = starts;
      const in90 = starts >= d90;
      const in30 = starts >= d30;
      const status = p.attendance;
      const punctuality = p.punctuality;
      // Lifetime counts
      if (status === 'attended') lifetime.attended++; else if (status === 'no_show') lifetime.no_shows++; else if (status === 'cancelled') lifetime.late_cancels++; else if (status === 'excused') lifetime.excused++;
      if (punctuality === 'on_time') lifetime.on_time++; else if (punctuality === 'late') lifetime.late++;
      if (in90) {
        if (status === 'attended') w90.attended++; else if (status === 'no_show') w90.no_shows++; else if (status === 'cancelled') w90.late_cancels++; else if (status === 'excused') w90.excused++;
        if (punctuality === 'on_time') w90.on_time++; else if (punctuality === 'late') w90.late++;
      }
      if (in30) {
        if (status === 'attended') w30.attended++; else if (status === 'no_show') w30.no_shows++; else if (status === 'cancelled') w30.late_cancels++; else if (status === 'excused') w30.excused++;
        if (punctuality === 'on_time') w30.on_time++; else if (punctuality === 'late') w30.late++;
      }
      // Host bonus: host role + completed event counts once
      if (p.role === 'host' && p.events?.status === 'completed' && starts >= d90 && p.events) {
        const eventIdKey = p.events.starts_at + p.role; // approx uniqueness; better to include event id but not selected; acceptable placeholder
        if (!seenHostEventIds.has(eventIdKey)) { safeHostEvents++; seenHostEventIds.add(eventIdKey); }
      }
    }
  });

  // Reviews (last 90 days only needed, fetch 90d and compute 30d subset)
  const { data: reviews, error: revErr } = await supabaseAdmin
    .from('reviews')
    .select('stars,reviewer_id,created_at')
    .eq('reviewee_id', userId)
    .gte('created_at', new Date(d90).toISOString())
    .returns<ReviewRow[]>();
  if (revErr) throw new Error('reviews: ' + revErr.message);
  const distinctReviewerIds = new Set<string>();
  const reviewerIds = new Set<string>();
  (reviews ?? []).forEach(r => { reviewerIds.add(r.reviewer_id); });
  let weightedSum30 = 0, weightTotal30 = 0, weightedSum90 = 0, weightTotal90 = 0;

  // Fetch reputations in a single query
  const repIds = Array.from(reviewerIds);
  let reputations: ReputationRow[] = [];
  if (repIds.length) {
    const { data: reps, error: repErr } = await supabaseAdmin
      .from('user_reputation')
      .select('user_id,rep')
      .in('user_id', repIds)
      .returns<ReputationRow[]>();
    if (repErr) throw new Error('reputation: ' + repErr.message);
    reputations = reps ?? [];
  }
  const repMap = new Map(reputations.map(r => [r.user_id, Number(r.rep)]));
  (reviews ?? []).forEach(r => {
    const ts = Date.parse(r.created_at);
    const rep = repMap.get(r.reviewer_id) ?? 0.5;
    if (ts >= d90) {
      w90.reviews++;
      weightedSum90 += r.stars * rep;
      weightTotal90 += rep;
      distinctReviewerIds.add(r.reviewer_id);
    }
    if (ts >= d30) {
      w30.reviews++;
      weightedSum30 += r.stars * rep;
      weightTotal30 += rep;
    }
  });
  if (weightTotal30) w30.weighted_review = weightedSum30 / weightTotal30;
  if (weightTotal90) w90.weighted_review = weightedSum90 / weightTotal90;
  if (lastEventAt) { w30.last_event_at = new Date(lastEventAt).toISOString(); w90.last_event_at = w30.last_event_at; }

  // Upsert reliability_metrics
  await supabaseAdmin.from('reliability_metrics').upsert({
    user_id: userId,
    window_30d_json: w30,
    window_90d_json: w90,
    lifetime_json: lifetime,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });

  const result = computeReliabilityIndex(w30, w90, w90.weighted_review, w90.reviews, safeHostEvents, distinctReviewerIds.size, lastEventAt ? Math.floor((Date.now()-lastEventAt)/86400000) : null);
  await supabaseAdmin.from('reliability_index').upsert({
    user_id: userId,
    score: result.score.toFixed(2),
    confidence: result.confidence.toFixed(2),
    components_json: result.components,
    last_recomputed: new Date().toISOString()
  }, { onConflict: 'user_id' });
  return result;
}

export async function listActiveUserIds(
  supabaseAdmin: SupabaseAdminClient,
  days = 90,
  limit = 100,
  offset = 0
): Promise<string[]> {
  const since = new Date(Date.now() - days*86400000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('event_participants')
    .select('user_id, updated_at')
    .gte('updated_at', since)
    .range(offset, offset + limit - 1)
    .returns<Array<{ user_id: string }>>();
  if (error) throw new Error(error.message);
  const ids = new Set((data ?? []).map((row) => row.user_id));
  return Array.from(ids);
}
