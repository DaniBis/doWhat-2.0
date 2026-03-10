import { evaluateActivityFirstDiscoveryPolicy } from '@dowhat/shared';

import { haversineMeters } from '@/lib/places/utils';
import { computeTrustScore } from './trust';

import type { DiscoveryItem, NormalizedDiscoveryFilters } from './engine-core';
import { normalizeList, roundCoordinate } from './engine-core';

type RankingContext = {
  center: { lat: number; lng: number };
  filters: NormalizedDiscoveryFilters;
};

type RankingBreakdown = {
  relevance: number;
  proximity: number;
  temporal: number;
  socialProof: number;
  quality: number;
};

const WEIGHTS = {
  relevance: 0.32,
  proximity: 0.22,
  temporal: 0.16,
  socialProof: 0.14,
  quality: 0.12,
} as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const buildDedupeKey = (item: DiscoveryItem): string => {
  const source = item.source ?? 'unknown';
  const normalizedName = item.name.trim().toLowerCase();
  if (item.place_id) {
    return `activity:${item.id}:place:${item.place_id}`;
  }
  return `fallback:${source}:${normalizedName}:${roundCoordinate(item.lat, 4)},${roundCoordinate(item.lng, 4)}`;
};

const scoreRelevance = (item: DiscoveryItem, filters: NormalizedDiscoveryFilters): number => {
  const tokens = [
    ...normalizeList(item.activity_types),
    ...normalizeList(item.tags),
    ...normalizeList(item.traits),
    ...normalizeList(item.taxonomy_categories),
  ];

  const wanted = [
    ...filters.activityTypes,
    ...filters.tags,
    ...filters.peopleTraits,
    ...filters.taxonomyCategories,
  ];

  if (!wanted.length) return 0.5;
  const matchCount = wanted.filter((value) => tokens.includes(value)).length;
  return clamp01(matchCount / wanted.length);
};

const scoreProximity = (item: DiscoveryItem, center: { lat: number; lng: number }): number => {
  const distance = item.distance_m ?? haversineMeters(center.lat, center.lng, item.lat, item.lng);
  const distanceKm = distance / 1000;
  const score = 1 / (1 + distanceKm / 2.5);
  return clamp01(score);
};

const scoreTemporal = (item: DiscoveryItem): number => {
  if (item.time_window === 'open_now') return 1;
  if (item.time_window === 'evening' || item.time_window === 'afternoon') return 0.72;
  if (item.time_window === 'morning' || item.time_window === 'late') return 0.6;
  return 0.45;
};

const scoreSocialProof = (item: DiscoveryItem): number => {
  const upcoming = item.upcoming_session_count ?? 0;
  const ratingCountScore = item.rating_count != null
    ? clamp01(Math.log1p(Math.max(0, item.rating_count)) / Math.log1p(250))
    : 0;
  const popularityScore = item.popularity_score != null
    ? clamp01(Math.log1p(Math.max(0, item.popularity_score)) / Math.log1p(20))
    : 0;
  const sessionScore = 1 - 1 / (1 + upcoming / 2);
  return clamp01(sessionScore * 0.45 + ratingCountScore * 0.3 + popularityScore * 0.25);
};

const scoreQuality = (item: DiscoveryItem): number => {
  const activityBoundary = evaluateActivityFirstDiscoveryPolicy({
    categories: item.tags ?? null,
    activityTypes: item.activity_types ?? null,
    taxonomyCategories: item.taxonomy_categories ?? null,
    hasVenueActivityMapping: item.source === 'activities' || item.verification_state === 'verified',
    hasManualOverride: item.verification_state === 'verified',
    hasEventOrSessionEvidence: (item.upcoming_session_count ?? 0) > 0,
  });
  const hasCanonicalPlace = Boolean(item.place_id);
  const hasPlaceLabel = Boolean(item.place_label);
  const hasWebsite = Boolean(item.website);
  const sourceBonus =
    item.source === 'postgis' || item.source === 'activities' || item.source === 'supabase-places'
      ? 0.06
      : 0;
  const sourceConfidence = clamp01(item.source_confidence ?? 0);
  const ratingValueScore =
    typeof item.rating === 'number' && Number.isFinite(item.rating)
      ? clamp01((item.rating - 2.5) / 2.5)
      : 0;
  const activityEvidenceScore =
    (activityBoundary.hasActivityCategoryEvidence ? 0.18 : 0) +
    (activityBoundary.hasStructuredActivityEvidence ? 0.24 : 0) +
    (activityBoundary.hasVenueActivityMapping ? 0.14 : 0) +
    (activityBoundary.hasEventOrSessionEvidence ? 0.12 : 0) +
    (activityBoundary.hasManualOverride ? 0.08 : 0) -
    (activityBoundary.isHospitalityPrimary ? 0.16 : 0);
  const score =
    (hasCanonicalPlace ? 0.56 : 0.24) +
    (hasPlaceLabel ? 0.1 : 0) +
    (hasWebsite ? 0.06 : 0) +
    sourceBonus +
    sourceConfidence * 0.16 +
    ratingValueScore * 0.08 +
    activityEvidenceScore;
  return clamp01(score);
};

const toRankScore = (breakdown: RankingBreakdown, trustScore: number): number => {
  const score =
    WEIGHTS.relevance * breakdown.relevance +
    WEIGHTS.proximity * breakdown.proximity +
    WEIGHTS.temporal * breakdown.temporal +
    WEIGHTS.socialProof * breakdown.socialProof +
    WEIGHTS.quality * breakdown.quality;
  const blended = score * 0.58 + trustScore * 0.42;
  return Number(blended.toFixed(6));
};

export const rankDiscoveryItems = (
  items: DiscoveryItem[],
  context: RankingContext,
): DiscoveryItem[] => {
  const ranked = items.map((item) => {
    const breakdown: RankingBreakdown = {
      relevance: scoreRelevance(item, context.filters),
      proximity: scoreProximity(item, context.center),
      temporal: scoreTemporal(item),
      socialProof: scoreSocialProof(item),
      quality: scoreQuality(item),
    };
    const freshnessHours = item.refreshed_at
      ? Math.max(0, (Date.now() - Date.parse(item.refreshed_at)) / (60 * 60 * 1000))
      : Number.NaN;
    const trust = computeTrustScore({
      aiConfidence: item.place_match_confidence ?? item.quality_confidence ?? null,
      qualityConfidence: breakdown.quality,
      sourceConfidence: item.source_confidence ?? null,
      verified: item.verification_state === 'verified',
      needsVerification: item.verification_state === 'needs_votes',
      userYesVotes: 0,
      userNoVotes: 0,
      rating: item.rating ?? null,
      ratingCount: item.rating_count ?? null,
      popularityScore: item.popularity_score ?? null,
      eventCount: item.upcoming_session_count ?? 0,
      freshnessHours,
    });
    const rankScore = toRankScore(breakdown, trust.trustScore);
    return {
      ...item,
      dedupe_key: buildDedupeKey(item),
      quality_confidence: Number(breakdown.quality.toFixed(4)),
      place_match_confidence: item.place_id ? Number(breakdown.quality.toFixed(4)) : null,
      trust_score: trust.trustScore,
      verification_state: item.verification_state ?? trust.verificationState,
      rank_score: rankScore,
      rank_breakdown: {
        ...breakdown,
      },
    } satisfies DiscoveryItem;
  });

  ranked.sort((a, b) => {
    const aScore = a.rank_score ?? 0;
    const bScore = b.rank_score ?? 0;
    if (aScore !== bScore) return bScore - aScore;
    const distanceA = a.distance_m ?? Number.POSITIVE_INFINITY;
    const distanceB = b.distance_m ?? Number.POSITIVE_INFINITY;
    if (distanceA !== distanceB) return distanceA - distanceB;
    return a.id.localeCompare(b.id);
  });

  return ranked;
};
