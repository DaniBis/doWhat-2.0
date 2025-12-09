import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVITY_CATALOG_PRESETS, type ActivityCatalogEntry } from '@dowhat/shared';

import { createServiceClient } from '@/lib/supabase/service';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

export type VenueActivitySource = 'manual' | 'category' | 'keyword';

export type MatchOptions = {
  limit?: number;
  city?: string;
  placeId?: string;
  dryRun?: boolean;
};

export type MatchSummary = {
  processed: number;
  matches: number;
  upserts: number;
  deletes: number;
  manualApplied: number;
  dryRun: boolean;
  catalogSize: number;
  details: Array<{
    placeId: string;
    name: string;
    matches: number;
    upserts: number;
    deletes: number;
    preview: Array<{ activityId: number; source: VenueActivitySource }>;
  }>;
  errors: Array<{ placeId: string; message: string }>;
};

type ActivityCatalogRow = ActivityCatalogEntry & {
  keywords: string[];
  fsq_categories: string[];
};

type PlaceRow = {
  id: string;
  name: string;
  description: string | null;
  categories: string[] | null;
  tags: string[] | null;
  metadata: unknown;
  city: string | null;
  locality: string | null;
  foursquare_id: string | null;
  updated_at: string | null;
  venue_activities: Array<{ activity_id: number; source: VenueActivitySource; confidence: number | null }> | null;
};

type ManualOverrideRow = {
  activity_id: number;
  venue_id: string;
  reason: string | null;
};

type FoursquareSourceRow = {
  place_id: string;
  raw: unknown;
};

type SearchIndex = {
  text: string;
  tokens: Set<string>;
  empty: boolean;
};

type ActivityMatch = {
  activityId: number;
  source: VenueActivitySource;
  confidence: number;
  detail?: string;
};

type PlaceMatchResult = {
  matches: Map<number, ActivityMatch>;
  upserts: Array<{ venue_id: string; activity_id: number; source: VenueActivitySource; confidence: number; matched_at: string }>;
  deletes: number[];
  manualCount: number;
};

const SOURCE_PRIORITY: Record<VenueActivitySource, number> = {
  manual: 3,
  category: 2,
  keyword: 1,
};

const CATEGORY_CONFIDENCE = 0.92;
const KEYWORD_CONFIDENCE = 0.6;

export async function matchActivitiesForPlaces(options: MatchOptions = {}): Promise<MatchSummary> {
  const supabase = createServiceClient();
  const catalog = await loadActivityCatalog(supabase);

  const places = await loadPlacesBatch(supabase, options);
  const placeIds = places.map((place) => place.id);

  const [fsqCategoryMap, manualOverrideMap] = await Promise.all([
    loadFoursquareCategoryMap(supabase, placeIds),
    loadManualOverrides(supabase, placeIds),
  ]);

  const summary: MatchSummary = {
    processed: places.length,
    matches: 0,
    upserts: 0,
    deletes: 0,
    manualApplied: 0,
    dryRun: Boolean(options.dryRun),
    catalogSize: catalog.length,
    details: [],
    errors: [],
  };

  if (!places.length) {
    return summary;
  }

  const nowIso = new Date().toISOString();

  for (const place of places) {
    try {
      const fsqCategories = fsqCategoryMap.get(place.id) ?? new Set<string>();
      const manualOverrides = manualOverrideMap.get(place.id) ?? [];
      const result = computeMatchesForPlace({ place, catalog, fsqCategories, manualOverrides, nowIso });

      summary.matches += result.matches.size;
      summary.upserts += result.upserts.length;
      summary.deletes += result.deletes.length;
      summary.manualApplied += result.manualCount;

      if (!options.dryRun) {
        if (result.deletes.length) {
          const { error } = await supabase
            .from('venue_activities')
            .delete()
            .eq('venue_id', place.id)
            .in('activity_id', result.deletes);
          if (error) throw error;
        }
        if (result.upserts.length) {
          const { error } = await supabase.from('venue_activities').upsert(result.upserts);
          if (error) throw error;
        }
      }

      if (summary.details.length < 25) {
        const preview = Array.from(result.matches.entries())
          .slice(0, 5)
          .map(([activityId, match]) => ({ activityId, source: match.source }));
        summary.details.push({
          placeId: place.id,
          name: place.name,
          matches: result.matches.size,
          upserts: result.upserts.length,
          deletes: result.deletes.length,
          preview,
        });
      }
    } catch (error) {
      summary.errors.push({ placeId: place.id, message: getErrorMessage(error) });
    }
  }

  return summary;
}

type PlaceMatchContext = {
  place: PlaceRow;
  catalog: ActivityCatalogRow[];
  fsqCategories: Set<string>;
  manualOverrides: ManualOverrideRow[];
  nowIso: string;
};

function computeMatchesForPlace(context: PlaceMatchContext): PlaceMatchResult {
  const { place, catalog, fsqCategories, manualOverrides, nowIso } = context;
  const existingRows = Array.isArray(place.venue_activities) ? place.venue_activities : [];
  const existingMap = new Map<number, { source: VenueActivitySource; confidence: number | null }>();
  existingRows.forEach((row) => {
    if (typeof row.activity_id === 'number') {
      existingMap.set(row.activity_id, {
        source: row.source,
        confidence: row.confidence,
      });
    }
  });

  const matches = new Map<number, ActivityMatch>();
  let manualCount = 0;

  manualOverrides.forEach((override) => {
    if (typeof override.activity_id !== 'number') return;
    manualCount += 1;
    matches.set(override.activity_id, {
      activityId: override.activity_id,
      source: 'manual',
      confidence: 1,
      detail: override.reason ?? undefined,
    });
  });

  const searchIndex = buildSearchIndex(place);

  catalog.forEach((activity) => {
    if (typeof activity.id !== 'number') return;
    const match = evaluateActivityMatch(activity, searchIndex, fsqCategories);
    if (!match) return;
    const existing = matches.get(activity.id);
    if (existing && SOURCE_PRIORITY[existing.source] >= SOURCE_PRIORITY[match.source]) {
      return;
    }
    matches.set(activity.id, match);
  });

  const upserts: PlaceMatchResult['upserts'] = [];
  matches.forEach((match, activityId) => {
    const confidence = Number(match.confidence.toFixed(3));
    const existing = existingMap.get(activityId);
    if (!existing) {
      upserts.push({ venue_id: place.id, activity_id: activityId, source: match.source, confidence, matched_at: nowIso });
      return;
    }
    const prevConfidence = typeof existing.confidence === 'number' ? Number(existing.confidence) : null;
    const hasConfidenceDiff =
      prevConfidence == null || Math.abs(prevConfidence - confidence) > 0.01;
    if (existing.source !== match.source || hasConfidenceDiff) {
      upserts.push({ venue_id: place.id, activity_id: activityId, source: match.source, confidence, matched_at: nowIso });
    }
  });

  const deletes: number[] = [];
  existingMap.forEach((_value, activityId) => {
    if (!matches.has(activityId)) {
      deletes.push(activityId);
    }
  });

  return { matches, upserts, deletes, manualCount };
}

function evaluateActivityMatch(
  activity: ActivityCatalogRow,
  searchIndex: SearchIndex,
  fsqCategories: Set<string>,
): ActivityMatch | null {
  const fsqMatch = findFsqCategoryMatch(activity, fsqCategories);
  if (fsqMatch) {
    return { activityId: activity.id, source: 'category', confidence: CATEGORY_CONFIDENCE, detail: fsqMatch };
  }

  const keywordMatch = findKeywordMatch(activity, searchIndex);
  if (keywordMatch) {
    return { activityId: activity.id, source: 'keyword', confidence: KEYWORD_CONFIDENCE, detail: keywordMatch };
  }

  return null;
}

function findFsqCategoryMatch(activity: ActivityCatalogRow, fsqCategories: Set<string>): string | null {
  if (!activity.fsq_categories?.length || !fsqCategories.size) return null;
  const normalizedTargets = activity.fsq_categories
    .map(normalizeFsqId)
    .filter((value): value is string => Boolean(value));
  if (!normalizedTargets.length) return null;
  const match = normalizedTargets.find((target) => fsqCategories.has(target));
  return match ?? null;
}

function findKeywordMatch(activity: ActivityCatalogRow, searchIndex: SearchIndex): string | null {
  if (searchIndex.empty || !activity.keywords?.length) return null;
  return activity.keywords.find((keyword) => matchesKeyword(searchIndex, keyword)) ?? null;
}

function matchesKeyword(index: SearchIndex, keyword: string): boolean {
  const normalized = normalizeSearchString(keyword);
  if (!normalized) return false;
  if (index.text.includes(` ${normalized} `)) return true;
  if (!normalized.includes(' ') && index.tokens.has(normalized)) return true;
  if (!normalized.includes(' ') && normalized.endsWith('s')) {
    const singular = normalized.slice(0, -1);
    if (singular.length >= 3 && index.tokens.has(singular)) {
      return true;
    }
  }
  return false;
}

function buildSearchIndex(place: PlaceRow): SearchIndex {
  const segments: string[] = [];
  const push = (value: string | null | undefined) => {
    if (value) segments.push(value.replace(/[_/]+/g, ' '));
  };
  push(place.name);
  push(place.description);
  (place.tags ?? []).forEach((tag) => push(tag));
  (place.categories ?? []).forEach((category) => push(category));
  const normalized = normalizeSearchString(segments.join(' '));
  const text = normalized ? ` ${normalized} ` : '';
  const tokens = normalized ? new Set(normalized.split(' ')) : new Set<string>();
  return { text, tokens, empty: !normalized };
}

function normalizeSearchString(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeFsqId(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const str = String(value).trim().toLowerCase();
  return str || null;
}

async function loadActivityCatalog(client: SupabaseClient): Promise<ActivityCatalogRow[]> {
  const fallback = ACTIVITY_CATALOG_PRESETS.map((entry) => ({
    ...entry,
    keywords: entry.keywords ?? [],
    fsq_categories: entry.fsq_categories ?? [],
  }));

  try {
    const { data, error } = await client
      .from('activity_catalog')
      .select('id, slug, name, description, keywords, fsq_categories')
      .order('id', { ascending: true });
    if (error) throw error;
    if (!data?.length) {
      return fallback;
    }
    return data.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description ?? null,
      keywords: Array.isArray(row.keywords) ? row.keywords : [],
      fsq_categories: Array.isArray(row.fsq_categories) ? row.fsq_categories : [],
    }));
  } catch (error) {
    if (isMissingTableError(error)) {
      return fallback;
    }
    throw error;
  }
}

async function loadPlacesBatch(client: SupabaseClient, options: MatchOptions): Promise<PlaceRow[]> {
  const limit = clampLimit(options.placeId ? 1 : options.limit ?? 100);
  let query = client
    .from('places')
    .select(
      `id,name,description,categories,tags,metadata,city,locality,foursquare_id,updated_at,venue_activities!left(activity_id,source,confidence)`,
    )
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (options.placeId) {
    query = query.eq('id', options.placeId).limit(1);
  }
  if (options.city) {
    query = query.eq('city', options.city);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PlaceRow[];
}

async function loadFoursquareCategoryMap(client: SupabaseClient, placeIds: string[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (!placeIds.length) return map;
  const uniqueIds = Array.from(new Set(placeIds));
  const { data, error } = await client
    .from('place_sources')
    .select('place_id, raw')
    .eq('provider', 'foursquare')
    .in('place_id', uniqueIds);
  if (error) throw error;
  (data as FoursquareSourceRow[] | null)?.forEach((row) => {
    const ids = extractFsqCategoryIds(row.raw);
    if (!ids.length) return;
    const entry = map.get(row.place_id) ?? new Set<string>();
    ids.forEach((id) => entry.add(id));
    map.set(row.place_id, entry);
  });
  return map;
}

async function loadManualOverrides(client: SupabaseClient, placeIds: string[]): Promise<Map<string, ManualOverrideRow[]>> {
  const map = new Map<string, ManualOverrideRow[]>();
  if (!placeIds.length) return map;
  const uniqueIds = Array.from(new Set(placeIds));
  const { data, error } = await client
    .from('activity_manual_overrides')
    .select('activity_id, venue_id, reason')
    .in('venue_id', uniqueIds);
  if (error) throw error;
  (data as ManualOverrideRow[] | null)?.forEach((row) => {
    if (!map.has(row.venue_id)) {
      map.set(row.venue_id, []);
    }
    map.get(row.venue_id)!.push(row);
  });
  return map;
}

function extractFsqCategoryIds(payload: unknown): string[] {
  const result: string[] = [];
  const value = normalizeJson(payload);
  if (!value || typeof value !== 'object') return result;
  const categories = (value as { categories?: Array<{ id?: string | number }> }).categories;
  if (!Array.isArray(categories)) return result;
  categories.forEach((category) => {
    if (!category || typeof category !== 'object') return;
    const normalized = normalizeFsqId((category as { id?: string | number }).id ?? null);
    if (normalized) {
      result.push(normalized);
    }
  });
  return result;
}

function normalizeJson(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function isMissingTableError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof (error as { code?: string }).code === 'string' &&
      (error as { code?: string }).code === '42P01',
  );
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 50;
  return Math.min(500, Math.max(1, Math.floor(value)));
}
