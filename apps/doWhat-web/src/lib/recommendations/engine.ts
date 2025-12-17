import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_ACTIVITY_FILTER_PREFERENCES,
  loadUserPreference,
  normaliseActivityFilterPreferences,
  type ActivityFilterPreferences,
  hasSeedMarker,
} from '@dowhat/shared';

import type {
  RecommendationActivityRef,
  RecommendationRecord,
  RecommendationResponse,
  RecommendationSession,
  RecommendationVenueRef,
} from '@/types/recommendations';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

const TRAIT_WEIGHT = 45;
const CATEGORY_WEIGHT = 25;
const PROXIMITY_WEIGHT = 20;
const ENGAGEMENT_WEIGHT = 10;
const TOTAL_WEIGHT = TRAIT_WEIGHT + CATEGORY_WEIGHT + PROXIMITY_WEIGHT + ENGAGEMENT_WEIGHT;

const RECENT_WINDOW_DAYS = 45;
const LOOKAHEAD_DAYS = 21;
const MAX_DISTANCE_KM = 30;
const CANDIDATE_LIMIT = 80;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type EngineOptions = {
  supabase: SupabaseClient;
  userId: string;
  lat?: number | null;
  lng?: number | null;
  limit?: number;
};

type UserTraitSignal = { label: string; weight: number };
type TraitSignalMap = Map<string, UserTraitSignal>;

type RecentEngagementSignals = {
  hostWeights: Map<string, number>;
  activityWeights: Map<string, number>;
  categoryWeights: Map<string, number>;
};

const normaliseToken = (value?: string | null) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const normaliseList = (values?: (string | null)[] | null): string[] => {
  if (!values) return [];
  return values
    .map((value) => normaliseToken(value))
    .filter(Boolean);
};

const extractActivity = (activities: RecommendationSession['activities']): RecommendationActivityRef | null => {
  if (!activities) return null;
  return Array.isArray(activities) ? activities[0] ?? null : activities;
};

const extractVenue = (venues: RecommendationSession['venues']): RecommendationVenueRef | null => {
  if (!venues) return null;
  return Array.isArray(venues) ? venues[0] ?? null : venues;
};

const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const fetchUserTraitSignals = async (supabase: SupabaseClient, userId: string): Promise<TraitSignalMap> => {
  const { data, error } = await supabase
    .from('user_traits')
    .select('score_float, traits_catalog:trait_id(name)')
    .eq('user_id', userId)
    .order('score_float', { ascending: false })
    .limit(24);
  if (error) {
    throw new Error(`Failed to load user traits: ${getErrorMessage(error)}`);
  }
  const signals: TraitSignalMap = new Map();
  type TraitRow = {
    score_float: number | null;
    traits_catalog?: { name?: string | null } | null;
  };
  const rows = (data ?? []) as TraitRow[];
  for (const row of rows) {
    const name = row.traits_catalog?.name;
    if (!name) continue;
    const key = normaliseToken(name);
    if (!key) continue;
    const weight = clamp01((row.score_float ?? 0) / 100);
    signals.set(key, { label: name, weight });
  }
  return signals;
};

const fetchActivityPreferences = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<ActivityFilterPreferences> => {
  try {
    const stored = await loadUserPreference<ActivityFilterPreferences>(supabase, userId, 'activity_filters');
    if (!stored) return DEFAULT_ACTIVITY_FILTER_PREFERENCES;
    return normaliseActivityFilterPreferences(stored);
  } catch (error) {
    console.warn('[recommendations] failed to fetch activity preferences', getErrorMessage(error));
    return DEFAULT_ACTIVITY_FILTER_PREFERENCES;
  }
};

const fetchRecentEngagementSignals = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<RecentEngagementSignals> => {
  const cutoff = new Date(Date.now() - RECENT_WINDOW_DAYS * MS_PER_DAY).toISOString();
  const { data, error } = await supabase
    .from('session_attendees')
    .select(`
      status,
      sessions!inner(
        id,
        host_user_id,
        activity_id,
        starts_at,
        activities(id, activity_types)
      )
    `)
    .eq('user_id', userId)
    .neq('status', 'declined')
    .gte('sessions.starts_at', cutoff)
    .limit(200);
  if (error) {
    throw new Error(`Failed to load recent engagement: ${getErrorMessage(error)}`);
  }
  const hostWeights = new Map<string, number>();
  const activityWeights = new Map<string, number>();
  const categoryWeights = new Map<string, number>();
  for (const row of data ?? []) {
    const session = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions;
    if (!session) continue;
    const startsAt = new Date(session.starts_at ?? '').getTime();
    if (Number.isNaN(startsAt)) continue;
    const recency = clamp01(1 - (Date.now() - startsAt) / (RECENT_WINDOW_DAYS * MS_PER_DAY));
    const status = (row.status ?? '').toLowerCase();
    const statusWeight = status === 'going' ? 1 : status === 'interested' ? 0.7 : 0.5;
    const weight = clamp01(recency * statusWeight);
    if (session.host_user_id) {
      hostWeights.set(session.host_user_id, Math.max(hostWeights.get(session.host_user_id) ?? 0, weight));
    }
    if (session.activity_id) {
      activityWeights.set(session.activity_id, Math.max(activityWeights.get(session.activity_id) ?? 0, weight));
    }
    const activity = Array.isArray(session.activities) ? session.activities[0] : session.activities;
    const categories = normaliseList(activity?.activity_types ?? []);
    for (const category of categories) {
      categoryWeights.set(category, Math.max(categoryWeights.get(category) ?? 0, weight));
    }
  }
  return { hostWeights, activityWeights, categoryWeights };
};

const fetchCandidateSessions = async (supabase: SupabaseClient): Promise<RecommendationSession[]> => {
  const nowIso = new Date().toISOString();
  const horizonIso = new Date(Date.now() + LOOKAHEAD_DAYS * MS_PER_DAY).toISOString();
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      id,
      activity_id,
      host_user_id,
      price_cents,
      starts_at,
      ends_at,
      venue_id,
      visibility,
      activities(
        id,
        name,
        description,
        activity_types,
        tags,
        traits,
        participant_preferences:activity_participant_preferences(preferred_traits)
      ),
      venues(id, name, address, lat:lat, lng:lng)
    `)
    .gte('starts_at', nowIso)
    .lte('starts_at', horizonIso)
    .order('starts_at', { ascending: true })
    .limit(CANDIDATE_LIMIT);
  if (error) {
    throw new Error(`Failed to load upcoming sessions: ${getErrorMessage(error)}`);
  }
  return (data ?? []) as RecommendationSession[];
};

const buildCategoryTargets = (
  prefs: ActivityFilterPreferences,
  recent: Map<string, number>,
): Map<string, number> => {
  const targets = new Map<string, number>();
  for (const category of prefs.categories ?? []) {
    const key = normaliseToken(category);
    if (!key) continue;
    targets.set(key, 1);
  }
  for (const [category, weight] of recent.entries()) {
    if (!category) continue;
    const existing = targets.get(category) ?? 0;
    targets.set(category, Math.max(existing, clamp01(weight)));
  }
  return targets;
};

type TraitScoreResult = { value: number; matchedTraits: string[] };

type CategoryScoreResult = { value: number; matchedCategories: string[] };

type ProximityScoreResult = { value: number; distanceKm?: number | null };

type EngagementScoreResult = { value: number; matches: string[] };

const scoreTraitMatch = (
  traits: TraitSignalMap,
  activity: RecommendationActivityRef | null,
): TraitScoreResult => {
  if (!activity || !traits.size) return { value: 0, matchedTraits: [] };
  const participantPref = extractActivityPreferences(activity);
  const rawTargets = participantPref?.preferred_traits?.length
    ? participantPref.preferred_traits
    : activity.traits ?? null;
  const tokens = (rawTargets ?? [])
    .map((label) => ({ label, key: normaliseToken(label) }))
    .filter((entry) => entry.key);
  if (!tokens.length) return { value: 0, matchedTraits: [] };
  let numerator = 0;
  const matched: string[] = [];
  for (const token of tokens) {
    const signal = traits.get(token.key);
    if (!signal) continue;
    numerator += signal.weight;
    matched.push(signal.label);
  }
  const denominator = tokens.length;
  const ratio = denominator ? clamp01(numerator / denominator) : 0;
  return { value: TRAIT_WEIGHT * ratio, matchedTraits: matched };
};

const extractActivityPreferences = (
  activity: RecommendationActivityRef | null,
): { preferred_traits?: string[] | null } | null => {
  if (!activity) return null;
  const preferences = activity.participant_preferences;
  if (!preferences) return null;
  if (Array.isArray(preferences)) {
    return preferences[0] ?? null;
  }
  return preferences;
};

const scoreCategoryMatch = (
  targets: Map<string, number>,
  activity: RecommendationActivityRef | null,
): CategoryScoreResult => {
  if (!targets.size || !activity) return { value: 0, matchedCategories: [] };
  const categories = (activity.activity_types ?? activity.tags ?? [])
    .map((label) => ({ label, key: normaliseToken(label) }))
    .filter((entry) => entry.key);
  if (!categories.length) return { value: 0, matchedCategories: [] };
  let numerator = 0;
  let denominator = 0;
  targets.forEach((weight) => {
    denominator += weight;
  });
  const matchedLabels: string[] = [];
  const seen = new Set<string>();
  for (const category of categories) {
    const targetWeight = targets.get(category.key);
    if (!targetWeight) continue;
    numerator += targetWeight;
    if (!seen.has(category.key)) {
      matchedLabels.push(category.label);
      seen.add(category.key);
    }
  }
  const ratio = denominator ? clamp01(numerator / denominator) : 0;
  return { value: CATEGORY_WEIGHT * ratio, matchedCategories: matchedLabels };
};

const scoreProximity = (
  lat: number | null | undefined,
  lng: number | null | undefined,
  venue: RecommendationVenueRef | null,
): ProximityScoreResult => {
  if (
    lat == null ||
    lng == null ||
    venue?.lat == null ||
    venue?.lng == null
  ) {
    return { value: 0, distanceKm: null };
  }
  const distanceKm = haversineKm(lat, lng, venue.lat, venue.lng);
  const ratio = clamp01(1 - distanceKm / MAX_DISTANCE_KM);
  return { value: PROXIMITY_WEIGHT * ratio, distanceKm };
};

const scoreEngagement = (
  session: RecommendationSession,
  hostWeights: Map<string, number>,
  activityWeights: Map<string, number>,
): EngagementScoreResult => {
  let value = 0;
  const matches: string[] = [];
  if (session.host_user_id && hostWeights.has(session.host_user_id)) {
    const weight = hostWeights.get(session.host_user_id) ?? 0;
    value += ENGAGEMENT_WEIGHT * 0.6 * clamp01(weight);
    matches.push('host');
  }
  if (session.activity_id && activityWeights.has(session.activity_id)) {
    const weight = activityWeights.get(session.activity_id) ?? 0;
    value += ENGAGEMENT_WEIGHT * 0.4 * clamp01(weight);
    matches.push('activity');
  }
  return { value: Math.min(ENGAGEMENT_WEIGHT, value), matches };
};

const toRecommendationRecord = (
  session: RecommendationSession,
  traitScore: TraitScoreResult,
  categoryScore: CategoryScoreResult,
  proximityScore: ProximityScoreResult,
  engagementScore: EngagementScoreResult,
): RecommendationRecord => {
  const score = traitScore.value + categoryScore.value + proximityScore.value + engagementScore.value;
  return {
    session,
    score,
    normalizedScore: TOTAL_WEIGHT ? clamp01(score / TOTAL_WEIGHT) : 0,
    breakdown: {
      components: {
        traits: traitScore.value,
        categories: categoryScore.value,
        proximity: proximityScore.value,
        engagement: engagementScore.value,
      },
      matchedTraits: traitScore.matchedTraits,
      matchedCategories: categoryScore.matchedCategories,
      distanceKm: proximityScore.distanceKm,
      engagementMatches: engagementScore.matches,
    },
  };
};

export const buildActivityRecommendations = async ({
  supabase,
  userId,
  lat,
  lng,
  limit = 12,
}: EngineOptions): Promise<RecommendationResponse> => {
  const [traitSignals, prefs, engagement, candidates] = await Promise.all([
    fetchUserTraitSignals(supabase, userId),
    fetchActivityPreferences(supabase, userId),
    fetchRecentEngagementSignals(supabase, userId),
    fetchCandidateSessions(supabase),
  ]);

  const categoryTargets = buildCategoryTargets(prefs, engagement.categoryWeights);

  const scored: RecommendationRecord[] = [];
  for (const session of candidates) {
    if (!session) continue;
    if (session.host_user_id === userId) continue;
    const activity = extractActivity(session.activities);
    if (!activity || hasSeedMarker(activity)) continue;
    const traitScore = scoreTraitMatch(traitSignals, activity);
    const categoryScore = scoreCategoryMatch(categoryTargets, activity);
    const venue = extractVenue(session.venues);
    const proximityScore = scoreProximity(lat, lng, venue);
    const engagementScore = scoreEngagement(session, engagement.hostWeights, engagement.activityWeights);
    scored.push(toRecommendationRecord(session, traitScore, categoryScore, proximityScore, engagementScore));
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const aStart = new Date(a.session.starts_at).getTime();
    const bStart = new Date(b.session.starts_at).getTime();
    if (Number.isNaN(aStart) || Number.isNaN(bStart)) return 0;
    return aStart - bStart;
  });

  return {
    userId,
    generatedAt: new Date().toISOString(),
    limit,
    recommendations: scored.slice(0, limit),
  };
};
