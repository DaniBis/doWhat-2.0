export type VerificationState = 'suggested' | 'verified' | 'needs_votes';

export type TrustScoreInput = {
  aiConfidence?: number | null;
  qualityConfidence?: number | null;
  sourceConfidence?: number | null;
  rating?: number | null;
  verified?: boolean;
  needsVerification?: boolean;
  userYesVotes?: number | null;
  userNoVotes?: number | null;
  ratingCount?: number | null;
  popularityScore?: number | null;
  eventCount?: number | null;
  freshnessHours?: number | null;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const confidenceScore = (input: TrustScoreInput): number =>
  clamp01(Math.max(input.aiConfidence ?? 0, input.qualityConfidence ?? 0, input.sourceConfidence ?? 0));

const voteScore = (yes: number, no: number): number => {
  const total = Math.max(0, yes + no);
  if (total === 0) return 0.45;
  const ratio = yes / total;
  const confidence = Math.min(1, total / 6);
  return clamp01(ratio * confidence + 0.5 * (1 - confidence));
};

const ratingScore = (ratingCount: number): number => {
  if (!Number.isFinite(ratingCount) || ratingCount <= 0) return 0;
  return clamp01(Math.log1p(ratingCount) / Math.log1p(250));
};

const ratingValueScore = (rating: number): number => {
  if (!Number.isFinite(rating) || rating <= 0) return 0;
  return clamp01((rating - 2.5) / 2.5);
};

const demandScore = (eventCount: number, popularityScore: number): number => {
  const eventComponent = 1 - 1 / (1 + Math.max(0, eventCount) / 3);
  const popularityComponent = clamp01(Math.log1p(Math.max(0, popularityScore)) / Math.log1p(20));
  return clamp01(eventComponent * 0.7 + popularityComponent * 0.3);
};

const freshnessScore = (freshnessHours: number): number => {
  if (!Number.isFinite(freshnessHours) || freshnessHours < 0) return 0.5;
  return clamp01(1 - freshnessHours / (24 * 45));
};

const classifyVerificationState = (
  input: TrustScoreInput,
  confidence: number,
  yesVotes: number,
  noVotes: number,
): VerificationState => {
  if (input.verified || (yesVotes >= 3 && noVotes === 0)) {
    return 'verified';
  }
  if (input.needsVerification || confidence >= 0.72 || yesVotes + noVotes > 0) {
    return 'needs_votes';
  }
  return 'suggested';
};

export const computeTrustScore = (input: TrustScoreInput): { trustScore: number; verificationState: VerificationState } => {
  const yesVotes = Math.max(0, Math.round(input.userYesVotes ?? 0));
  const noVotes = Math.max(0, Math.round(input.userNoVotes ?? 0));
  const ratingCount = Math.max(0, Math.round(input.ratingCount ?? 0));
  const ratingValue = Number.isFinite(input.rating ?? Number.NaN) ? Number(input.rating) : Number.NaN;
  const eventCount = Math.max(0, Math.round(input.eventCount ?? 0));
  const popularityScoreRaw = Number.isFinite(input.popularityScore ?? Number.NaN)
    ? Number(input.popularityScore)
    : 0;
  const freshnessHoursRaw = Number.isFinite(input.freshnessHours ?? Number.NaN)
    ? Number(input.freshnessHours)
    : Number.NaN;

  const confidence = confidenceScore(input);
  const votes = voteScore(yesVotes, noVotes);
  const rating = clamp01(ratingScore(ratingCount) * 0.35 + ratingValueScore(ratingValue) * 0.65);
  const demand = demandScore(eventCount, popularityScoreRaw);
  const freshness = freshnessScore(freshnessHoursRaw);

  const state = classifyVerificationState(input, confidence, yesVotes, noVotes);
  const verification = state === 'verified' ? 1 : state === 'needs_votes' ? 0.72 : 0.42;
  const stateBonus = state === 'verified' ? 0.06 : 0;

  const score = clamp01(
    confidence * 0.32 +
      votes * 0.2 +
      verification * 0.16 +
      demand * 0.14 +
      rating * 0.1 +
      freshness * 0.08 +
      stateBonus,
  );

  return {
    trustScore: Number(score.toFixed(6)),
    verificationState: state,
  };
};
