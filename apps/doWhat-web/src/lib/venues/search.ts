import type { PostgrestFilterBuilder } from '@supabase/postgrest-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  ACTIVITY_NAMES,
  CLASSIFICATION_TTL_MS,
  VENUE_SEARCH_DEFAULT_RADIUS,
  VENUE_SEARCH_MAX_LIMIT,
} from '@/lib/venues/constants';
import type { ActivityName } from '@/lib/venues/constants';
import type { ActivityAvailabilitySummary, RankedVenueActivity } from '@/lib/venues/types';
import type { Database, Json } from '@/types/database';

const ACTIVITY_SET = new Set<ActivityName>(ACTIVITY_NAMES);

type Supabase = SupabaseClient<Database>;

type GeoBounds = {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
};

type GeoRadius = {
  center: { lat: number; lng: number };
  radiusMeters?: number;
};

type GeoFilters = {
  bounds?: GeoBounds;
  radius?: GeoRadius;
};

type VenueSearchParams = GeoFilters & {
  supabase: Supabase;
  activity: ActivityName;
  limit?: number;
  includeUnverified?: boolean;
};

type ActivitySummaryParams = GeoFilters & {
  supabase: Supabase;
  maxVenues?: number;
};

type VoteRow = {
  venue_id: string;
  activity_name: string;
  yes_votes: number | null;
  no_votes: number | null;
};

type DiscoveryMetadata = {
  categories: string[];
  keywords: string[];
};

type VenueRowLite = Database['public']['Tables']['venues']['Row'];

export interface VenueSearchDebug {
  limitApplied: number;
  venueCount: number;
  voteCount: number;
}

export async function searchVenueActivities(
  params: VenueSearchParams,
): Promise<{ results: RankedVenueActivity[]; debug: VenueSearchDebug }> {
  const limit = clampLimit(params.limit);
  const supabase = params.supabase;

  let query = supabase
    .from('venues')
    .select(
      'id,name,lat,lng,ai_activity_tags,ai_confidence_scores,verified_activities,needs_verification,metadata,last_ai_update',
    )
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .limit(Math.max(limit * 2, limit + 5));

  query = applyGeoFilters(query, params);
  query = query.or(`ai_activity_tags.cs.${JSON.stringify([params.activity])},verified_activities.cs.${JSON.stringify([params.activity])}`);

  const { data: venues, error } = await query;
  if (error) throw error;

  const filtered = (venues ?? []).filter((row) => venueSupportsActivity(row, params.activity));
  const venueIds = filtered.map((row) => row.id);
  const voteMap = await fetchVoteMap(supabase, venueIds, params.activity);

  const results = filtered
    .map((row) => buildRankedActivity(row, params.activity, voteMap.get(row.id)))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    results,
    debug: {
      limitApplied: limit,
      venueCount: filtered.length,
      voteCount: voteMap.size,
    },
  };
}

export async function listActivitiesSummary(params: ActivitySummaryParams): Promise<ActivityAvailabilitySummary[]> {
  const supabase = params.supabase;
  const maxVenues = Math.min(Math.max(params.maxVenues ?? 400, 50), 1000);

  let query = supabase
    .from('venues')
    .select('id,lat,lng,ai_activity_tags,ai_confidence_scores,verified_activities,needs_verification,last_ai_update')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .limit(maxVenues);

  query = applyGeoFilters(query, params);

  const { data: venues, error } = await query;
  if (error) throw error;

  const summaryMap = new Map<ActivityName, ActivityAvailabilitySummary & { confidenceSum: number; confidenceCount: number }>();

  ACTIVITY_NAMES.forEach((activity) => {
    summaryMap.set(activity, {
      activity,
      verifiedCount: 0,
      likelyCount: 0,
      possibleCount: 0,
      needsReviewCount: 0,
      averageConfidence: null,
      confidenceSum: 0,
      confidenceCount: 0,
    });
  });

  (venues ?? []).forEach((venue) => {
    const verifiedSet = new Set(filterActivityNames(venue.verified_activities));
    const aiTags = new Set(filterActivityNames(venue.ai_activity_tags));

    ACTIVITY_NAMES.forEach((activity) => {
      const confidence = resolveActivityConfidence(venue.ai_confidence_scores, activity);
      if (!verifiedSet.has(activity) && (!aiTags.has(activity) || confidence == null)) {
        return;
      }

      const entry = summaryMap.get(activity)!;
      if (verifiedSet.has(activity)) {
        entry.verifiedCount += 1;
      } else if (confidence != null && confidence >= 0.8) {
        entry.likelyCount += 1;
      } else if (confidence != null && confidence >= 0.5) {
        entry.possibleCount += 1;
      }

      if (venue.needs_verification) {
        entry.needsReviewCount += 1;
      }

      if (confidence != null) {
        entry.confidenceSum += confidence;
        entry.confidenceCount += 1;
      }
    });
  });

  const summaries: ActivityAvailabilitySummary[] = [];
  summaryMap.forEach((entry) => {
    const { confidenceSum, confidenceCount, ...rest } = entry;
    const averageConfidence = confidenceCount ? Number((confidenceSum / confidenceCount).toFixed(3)) : null;
    summaries.push({ ...rest, averageConfidence });
  });

  return summaries.sort((a, b) => {
    if (a.verifiedCount !== b.verifiedCount) return b.verifiedCount - a.verifiedCount;
    if (a.likelyCount !== b.likelyCount) return b.likelyCount - a.likelyCount;
    if (a.possibleCount !== b.possibleCount) return b.possibleCount - a.possibleCount;
    return (b.averageConfidence ?? 0) - (a.averageConfidence ?? 0);
  });
}

type VenueQueryBuilder = PostgrestFilterBuilder<
  Database['public'],
  Database['public']['Tables']['venues']['Row'],
  Database['public']['Tables']['venues']['Row']
>;

function applyGeoFilters<T extends VenueQueryBuilder>(query: T, filters: GeoFilters): T {
  if (filters.bounds) {
    const { sw, ne } = filters.bounds;
    query = query.gte('lat', sw.lat).lte('lat', ne.lat).gte('lng', sw.lng).lte('lng', ne.lng);
    return query;
  }

  if (filters.radius) {
    const radius = filters.radius.radiusMeters ?? VENUE_SEARCH_DEFAULT_RADIUS;
    const { lat, lng } = filters.radius.center;
    const degLat = radius / 110_540; // approx meters per degree latitude
    const degLng = radius / (111_320 * Math.cos((lat * Math.PI) / 180) || 1);
    const swLat = lat - degLat;
    const neLat = lat + degLat;
    const swLng = lng - degLng;
    const neLng = lng + degLng;
    query = query.gte('lat', swLat).lte('lat', neLat).gte('lng', swLng).lte('lng', neLng);
  }

  return query;
}

async function fetchVoteMap(supabase: Supabase, venueIds: string[], activity: ActivityName) {
  const map = new Map<string, { yes: number; no: number }>();
  if (!venueIds.length) return map;
  const { data, error } = await supabase
    .from('v_venue_activity_votes')
    .select('venue_id,activity_name,yes_votes,no_votes')
    .eq('activity_name', activity)
    .in('venue_id', venueIds);
  if (error) throw error;
  (data as VoteRow[] | null)?.forEach((row) => {
    map.set(row.venue_id, {
      yes: row.yes_votes ?? 0,
      no: row.no_votes ?? 0,
    });
  });
  return map;
}

function venueSupportsActivity(row: VenueRowLite, activity: ActivityName): boolean {
  const aiTags = filterActivityNames(row.ai_activity_tags);
  const verified = filterActivityNames(row.verified_activities);
  return aiTags.includes(activity) || verified.includes(activity);
}

function buildRankedActivity(
  row: VenueRowLite,
  activity: ActivityName,
  votes: { yes: number; no: number } | undefined,
): RankedVenueActivity {
  const verifiedSet = new Set(filterActivityNames(row.verified_activities));
  const aiTags = new Set(filterActivityNames(row.ai_activity_tags));
  const discovery = extractDiscoveryMetadata(row.metadata ?? null);
  const categoryMatch = matchesDiscovery(discovery.categories, activity);
  const keywordMatch = matchesDiscovery(discovery.keywords, activity);
  const aiConfidence = resolveActivityConfidence(row.ai_confidence_scores, activity) ?? (verifiedSet.has(activity) ? 1 : 0);
  const userYesVotes = votes?.yes ?? 0;
  const userNoVotes = votes?.no ?? 0;
  const score = calculateActivityScore({
    aiConfidence,
    userYesVotes,
    userNoVotes,
    categoryMatch,
    keywordMatch,
  });

  return {
    venueId: row.id,
    venueName: row.name ?? 'Unnamed venue',
    lat: row.lat,
    lng: row.lng,
    activity,
    aiConfidence,
    userYesVotes,
    userNoVotes,
    categoryMatch,
    keywordMatch,
    score,
    verified: verifiedSet.has(activity),
    needsVerification: Boolean(row.needs_verification && aiTags.has(activity) && !verifiedSet.has(activity)),
  };
}

export function calculateActivityScore(input: {
  aiConfidence: number | null;
  userYesVotes: number;
  userNoVotes: number;
  categoryMatch: boolean;
  keywordMatch: boolean;
}): number {
  const baseConfidence = Math.max(0, Math.min(1, input.aiConfidence ?? 0));
  const yesComponent = input.userYesVotes * 10;
  const noComponent = input.userNoVotes * 10;
  const categoryComponent = input.categoryMatch ? 15 : 0;
  const keywordComponent = input.keywordMatch ? 5 : 0;
  const score = baseConfidence * 0.6 + yesComponent - noComponent + categoryComponent + keywordComponent;
  return Number(score.toFixed(3));
}

export function resolveActivityConfidence(scores: Json | null, activity: ActivityName): number | null {
  if (!isJsonObject(scores)) return null;
  const value = scores[activity];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractDiscoveryMetadata(metadata: Json | null): DiscoveryMetadata {
  if (!isJsonObject(metadata)) {
    return { categories: [], keywords: [] };
  }
  const container = metadata as Record<string, unknown> & { discovery?: unknown };
  const discovery = isJsonObject(container.discovery) ? container.discovery : {};
  return {
    categories: toStringArray(discovery.categories),
    keywords: toStringArray(discovery.keywords),
  };
}

function matchesDiscovery(values: string[], activity: ActivityName): boolean {
  const normalized = activity.toLowerCase();
  return values.some((value) => value.toLowerCase() === normalized || value.toLowerCase().includes(normalized));
}

function filterActivityNames(values?: string[] | null): ActivityName[] {
  if (!values?.length) return [];
  return values.filter((value): value is ActivityName => ACTIVITY_SET.has(value as ActivityName));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : null))
    .filter((item): item is string => Boolean(item));
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampLimit(limit?: number | null) {
  if (!limit || !Number.isFinite(limit)) return 25;
  return Math.max(1, Math.min(VENUE_SEARCH_MAX_LIMIT, Math.floor(limit)));
}

export function isActivityName(value: unknown): value is ActivityName {
  return typeof value === 'string' && ACTIVITY_SET.has(value as ActivityName);
}

export function withinClassificationTTL(lastUpdateIso: string | null): boolean {
  if (!lastUpdateIso) return false;
  const last = Date.parse(lastUpdateIso);
  if (Number.isNaN(last)) return false;
  return Date.now() - last < CLASSIFICATION_TTL_MS;
}