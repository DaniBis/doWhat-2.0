import { db } from '@/lib/db';

type SB = ReturnType<typeof db>;

export type TraitScore = {
  trait_id: string;
  name: string;
  category: string;
  description?: string | null;
  score_float: number;
  confidence_float: number;
  last_updated_at: string;
  agreements?: number;
};

// Normalize an array of raw numbers to z-scores (mean 0, std 1).
export function zscores(values: number[]): number[] {
  if (!values.length) return [];
  const mean = values.reduce((a,b)=>a+b, 0) / values.length;
  const var_ = values.reduce((a,b)=>a + (b-mean)*(b-mean), 0) / values.length;
  const std = Math.sqrt(var_ || 1e-6);
  return values.map(v => (v - mean) / std);
}

// Map z-score to 0..100 bounded score using a sigmoid-like squashing
export function zToScore(z: number): number {
  const s = 1 / (1 + Math.exp(-z));
  return Math.max(0, Math.min(100, Math.round(s * 100)));
}

export async function ensureTraitByName(supabase: SB, name: string, category: string, description?: string) {
  const { data } = await supabase.from('traits_catalog').select('*').eq('name', name).maybeSingle();
  if (data) return data;
  const { data: ins, error } = await supabase
    .from('traits_catalog')
    .insert({ name, category, description })
    .select('*')
    .single();
  if (error) throw error;
  return ins;
}

// Ingest a batch of assessment numbers mapped to trait names
export async function ingestAssessment(userId: string, inputs: Record<string, number>) {
  const supabase = db();
  const names = Object.keys(inputs);
  if (!names.length) return;
  const values = names.map(n => inputs[n] ?? 0);
  const zs = zscores(values);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const z = zs[i];
    const scoreDelta = zToScore(z) - 50; // center around 50
    const { data: trait } = await supabase.from('traits_catalog').select('id').eq('name', name).maybeSingle();
    if (!trait) continue;
    await supabase.from('trait_events').insert({
      user_id: userId,
      trait_id: trait.id,
      source_type: 'assessment',
      delta: scoreDelta,
      weight: 1,
      metadata: { raw: inputs[name], z },
    });
  }
}

// Map behavior metrics into deltas for specific traits
export async function ingestBehaviorSignals(userId: string, metrics: {
  punctuality_rate?: number; // 0..1
  showup_rate?: number; // 0..1
  activity_diversity?: number; // categories tried count
  cancellation_rate?: number; // 0..1
}) {
  const supabase = db();
  const toInsert: any[] = [];

  async function add(name: string, delta: number, meta: any = {}) {
    const { data: trait } = await supabase.from('traits_catalog').select('id').eq('name', name).maybeSingle();
    if (!trait) return;
    toInsert.push({ user_id: userId, trait_id: trait.id, source_type: 'behavior', delta, weight: 1, metadata: meta });
  }

  if (typeof metrics.punctuality_rate === 'number') {
    await add('Punctual', Math.round((metrics.punctuality_rate - 0.5) * 40), { punctuality_rate: metrics.punctuality_rate });
    await add('Reliable', Math.round((metrics.punctuality_rate - 0.5) * 20));
  }
  if (typeof metrics.showup_rate === 'number') {
    await add('Reliable', Math.round((metrics.showup_rate - 0.5) * 30), { showup_rate: metrics.showup_rate });
    await add('Consistent', Math.round((metrics.showup_rate - 0.5) * 30));
  }
  if (typeof metrics.activity_diversity === 'number') {
    // More categories tried -> Curious/Open-minded up to a point
    const delta = Math.min(50, metrics.activity_diversity * 5);
    await add('Curious', delta, { activity_diversity: metrics.activity_diversity });
    await add('Open-minded', Math.round(delta * 0.6));
  }
  if (typeof metrics.cancellation_rate === 'number') {
    // Higher cancellation -> negative reliability
    const neg = Math.round((0.3 - metrics.cancellation_rate) * 60); // negative when >0.3
    await add('Reliable', neg, { cancellation_rate: metrics.cancellation_rate });
  }

  if (toInsert.length) {
    await supabase.from('trait_events').insert(toInsert);
  }
}

export async function peerAgree(endorserId: string, targetUserId: string, traitId: string, weeklyCap = 5) {
  const supabase = db();
  // Insert with uniqueness on (target, trait, endorser, week)
  const { error } = await supabase.from('trait_peer_agreements').insert({
    target_user_id: targetUserId,
    trait_id: traitId,
    endorser_user_id: endorserId,
  });
  if (error && !String(error.message).includes('duplicate')) return { ok: false, error: error.message };

  // Count for endorser this week
  const weekStart = startOfWeekUTC(new Date());
  const { count } = await supabase
    .from('trait_peer_agreements')
    .select('id', { count: 'exact', head: true })
    .eq('endorser_user_id', endorserId)
    .eq('trait_id', traitId)
    .eq('week_start', weekStart);
  if ((count ?? 0) > weeklyCap) {
    return { ok: false, error: 'Weekly cap reached' };
  }
  return { ok: true };
}

// Recompute aggregates with time decay on older signals
export async function recomputeUserTraits(userId: string) {
  const supabase = db();
  // Load events and catalog
  const { data: events } = await supabase
    .from('trait_events')
    .select('trait_id, delta, weight, occurred_at')
    .eq('user_id', userId);
  if (!events || !events.length) return;

  const now = Date.now();
  const byTrait = new Map<string, { wsum: number; w: number; sources: any[] }>();
  for (const ev of events) {
    const ageDays = (now - new Date(ev.occurred_at).getTime()) / (1000*60*60*24);
    const decay = Math.exp(-ageDays / 90); // ~e^-t/90 days half-life ~62d
    const w = (ev.weight || 1) * decay;
    const cur = byTrait.get(ev.trait_id) || { wsum: 0, w: 0, sources: [] };
    cur.wsum += ev.delta * w;
    cur.w += w;
    cur.sources.push({ type: 'event', delta: ev.delta, w, at: ev.occurred_at });
    byTrait.set(ev.trait_id, cur);
  }

  // Include peer agreements as small positive signals
  const { data: peers } = await supabase
    .from('v_trait_peer_agreement_counts')
    .select('*')
    .eq('user_id', userId);
  for (const p of (peers || [])) {
    const cur = byTrait.get(p.trait_id) || { wsum: 0, w: 0, sources: [] };
    cur.wsum += (p.agreements || 0) * 2; // small boost per agreement
    cur.w += (p.agreements || 0) * 0.5;
    cur.sources.push({ type: 'peer', count: p.agreements });
    byTrait.set(p.trait_id, cur);
  }

  // Compute score (base 50) and confidence (scaled 0..1) and upsert
  for (const [traitId, agg] of byTrait.entries()) {
    const score = Math.max(0, Math.min(100, 50 + agg.wsum));
    const confidence = Math.max(0.05, Math.min(1, agg.w / 20));
    try {
      await supabase.rpc('ensure_user_trait_row', { p_user: userId, p_trait: traitId });
    } catch {}
    await supabase
      .from('user_traits')
      .upsert({
        user_id: userId,
        trait_id: traitId,
        score_float: score,
        confidence_float: confidence,
        last_updated_at: new Date().toISOString(),
        sources_json: agg.sources,
      }, { onConflict: 'user_id,trait_id' });
  }
}

export async function getUserTraits(userId: string): Promise<TraitScore[]> {
  const supabase = db();
  const { data, error } = await supabase
    .from('user_traits')
    .select('score_float, confidence_float, last_updated_at, traits_catalog:trait_id(id,name,category,description), v_trait_peer_agreement_counts!left(agreements)')
    .eq('user_id', userId)
    .order('score_float', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    trait_id: row.traits_catalog?.id,
    name: row.traits_catalog?.name,
    category: row.traits_catalog?.category,
    description: row.traits_catalog?.description,
    score_float: row.score_float,
    confidence_float: row.confidence_float,
    last_updated_at: row.last_updated_at,
    agreements: row.v_trait_peer_agreement_counts?.agreements ?? 0,
  }));
}

function startOfWeekUTC(d: Date) {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return monday.toISOString().slice(0,10);
}
