// Reliability Index computation & aggregation
// Focus: pure functions + thin Supabase aggregation helpers
import { RELIABILITY_DEFAULT_WEIGHTS, type ReliabilityMetricsWindow, type ReliabilityComponentsBreakdown } from '@dowhat/shared';

// Lightweight shapes (mirror DB columns minimally)
interface ParticipantRow { attendance: string | null; updated_at: string; punctuality: string | null; role: 'host'|'guest'; }
interface ReviewRow { stars: number; reviewer_id: string; created_at: string; }
interface ReputationRow { rep: number }

export interface ReliabilityScoreResult {
  score: number;
  confidence: number;
  components: ReliabilityComponentsBreakdown & { RS?: number | null };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function computeAttendanceScore(w30: ReliabilityMetricsWindow, w90: ReliabilityMetricsWindow) {
  const base = (w: ReliabilityMetricsWindow) => {
    const A = w.attended || 0;
    const NS = w.no_shows || 0;
    const Cx = w.late_cancels || 0;
    const Ex = w.excused || 0;
    const OT = w.on_time || 0;
    const L = w.late || 0;
    const totalActs = A + NS + Cx + Ex;
    const att_rate = totalActs ? A / totalActs : 0;
    const no_show_rate = (A + NS) ? NS / (A + NS) : 0;
    const late_cancel_rate = totalActs ? Cx / totalActs : 0;
    const punctuality = (OT + L) ? OT / (OT + L) : 0;
    const AS_base = 100 * att_rate;
    const AS_penalty = 100 * (RELIABILITY_DEFAULT_WEIGHTS.NO_SHOW_WEIGHT * no_show_rate + RELIABILITY_DEFAULT_WEIGHTS.LATE_CANCEL_WEIGHT * late_cancel_rate);
    const AS_punct = 10 * (punctuality - 0.5); // -5..+5
    return clamp(AS_base - AS_penalty + AS_punct, 0, 100);
  };
  const AS_30 = base(w30);
  const AS_90 = base(w90);
  const AS = RELIABILITY_DEFAULT_WEIGHTS.RECENCY_BLEND_30 * AS_30 + RELIABILITY_DEFAULT_WEIGHTS.RECENCY_BLEND_90 * AS_90;
  return { AS, AS_30, AS_90 };
}

export function computeReviewScore(weightedReview: number | undefined | null, reviewCount: number | undefined | null) {
  if (!weightedReview || !reviewCount || reviewCount < 2) return { RS: null };
  // weightedReview is raw 1..5 value; map to 0..100
  const RS = 25 * (weightedReview - 1);
  return { RS: clamp(RS, 0, 100) };
}

export function fuseReliability(
  attendance: { AS: number; AS_30: number; AS_90: number },
  RS: number | null,
  safeHostEvents: number
): ReliabilityScoreResult {
  let score = RS == null ? attendance.AS : 0.75 * attendance.AS + 0.25 * RS;
  const host_bonus = Math.min(5, 2 * safeHostEvents);
  score = clamp(score + host_bonus, 0, 100);
  return {
    score,
    confidence: 0, // placeholder (compute separately)
    components: { AS_30: attendance.AS_30, AS_90: attendance.AS_90, RS, host_bonus }
  };
}

export function computeConfidence(w90: ReliabilityMetricsWindow, reviewDistinct: number, lastEventDays: number | null, distinctReviewers: number) {
  const vol = clamp(((w90.attended||0)+(w90.no_shows||0)+(w90.late_cancels||0)+(w90.excused||0))/10, 0, 1);
  const rev = clamp((w90.reviews||0)/5, 0, 1);
  const div = clamp(distinctReviewers/3, 0, 1);
  const rec = lastEventDays == null ? 0 : Math.exp(-lastEventDays/21);
  return clamp(0.25 + 0.35*vol + 0.20*rev + 0.10*div + 0.10*rec, 0, 1);
}

// High-level orchestrator given pre-fetched windows & review metrics
export function computeReliabilityIndex(
  w30: ReliabilityMetricsWindow,
  w90: ReliabilityMetricsWindow,
  weightedReview: number | undefined | null,
  reviewCount: number | undefined | null,
  safeHostEvents: number,
  distinctReviewers: number,
  daysSinceLastEvent: number | null
): ReliabilityScoreResult {
  const { AS, AS_30, AS_90 } = computeAttendanceScore(w30, w90);
  const { RS } = computeReviewScore(weightedReview, reviewCount);
  const fused = fuseReliability({ AS, AS_30, AS_90 }, RS, safeHostEvents);
  const confidence = computeConfidence(w90, reviewCount || 0, daysSinceLastEvent, distinctReviewers);
  return { ...fused, confidence };
}

// Supabase aggregation (nightly) placeholder: fetch and compute then persist
// Implementation detail deferred until endpoints wired.
