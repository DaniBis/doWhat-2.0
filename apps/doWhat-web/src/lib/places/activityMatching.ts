import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVITY_CATALOG_PRESETS, evaluateActivityFirstDiscoveryPolicy, type ActivityCatalogEntry } from '@dowhat/shared';

import { resolveCityScope } from '@/lib/places/cityScope';
import { createServiceClient } from '@/lib/supabase/service';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

export type VenueActivitySource = 'manual' | 'category' | 'keyword';

export type MatchOptions = {
  limit?: number;
  city?: string;
  placeId?: string;
  placeIds?: string[];
  offset?: number;
  dryRun?: boolean;
};

export type MatchSummary = {
  processed: number;
  matches: number;
  upserts: number;
  deletes: number;
  hospitalityKeywordDeletes: number;
  eventEvidenceProtectedMatches: number;
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

type ActivityMatchingPolicy = {
  allowKeywordMatch: boolean;
  activityEvidenceIds: Set<number>;
};

type ActivityMatch = {
  activityId: number;
  source: VenueActivitySource;
  confidence: number;
  detail?: string;
  usedEventEvidence?: boolean;
};

type PlaceMatchResult = {
  matches: Map<number, ActivityMatch>;
  upserts: Array<{ venue_id: string; activity_id: number; source: VenueActivitySource; confidence: number; matched_at: string }>;
  deletes: number[];
  hospitalityKeywordDeletes: number;
  eventEvidenceProtectedMatches: number;
  manualCount: number;
};

type SessionEvidenceRow = {
  place_id: string;
  activity_id: string | null;
};

type ActivityEvidenceRow = {
  id: string;
  catalog_activity_id?: number | null;
  name?: string | null;
  tags?: string[] | null;
};

const SOURCE_PRIORITY: Record<VenueActivitySource, number> = {
  manual: 3,
  category: 2,
  keyword: 1,
};

const CATEGORY_CONFIDENCE = 0.92;
const KEYWORD_CONFIDENCE = 0.6;
const MATCHER_QUERY_CHUNK_SIZE = 180;

const logMatcherInfo = (message: string, meta?: Record<string, unknown>) => {
  if (process.env.NODE_ENV === 'production') return;
  console.info('[activity-matcher]', message, meta ?? {});
};

const logMatcherWarn = (message: string, meta?: Record<string, unknown>) => {
  if (process.env.NODE_ENV === 'production') return;
  console.warn('[activity-matcher]', message, meta ?? {});
};

const chunkValues = <T,>(values: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    const chunk = values.slice(index, index + size);
    if (chunk.length) chunks.push(chunk);
  }
  return chunks;
};

const describeArrayLike = (value: unknown): string => {
  if (Array.isArray(value)) return `array:${value.length}`;
  if (value == null) return 'nullish';
  return typeof value;
};

const runMatcherStep = async <T,>(
  step: string,
  meta: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> => {
  logMatcherInfo(`${step}:start`, meta);
  try {
    const result = await fn();
    logMatcherInfo(`${step}:ok`, meta);
    return result;
  } catch (error) {
    console.error('[activity-matcher]', `${step}:failed`, { ...meta, error });
    throw error;
  }
};

export async function matchActivitiesForPlaces(options: MatchOptions = {}): Promise<MatchSummary> {
  const supabase = createServiceClient();
  const requestMeta = {
    city: options.city ?? null,
    placeId: options.placeId ?? null,
    placeIds: options.placeIds?.length ?? 0,
    limit: options.limit ?? null,
    offset: options.offset ?? 0,
    dryRun: Boolean(options.dryRun),
  };
  logMatcherInfo('run:start', requestMeta);

  const catalog = await runMatcherStep('catalog', requestMeta, () => loadActivityCatalog(supabase));

  const places = await runMatcherStep('places-batch', requestMeta, () => loadPlacesBatch(supabase, options));
  const placeIds = places.map((place) => place.id);

  const [fsqCategoryMap, manualOverrideMap, activityEvidenceByPlaceId] = await Promise.all([
    runMatcherStep('foursquare-category-preload', { ...requestMeta, placeCount: placeIds.length }, () =>
      loadFoursquareCategoryMap(supabase, placeIds),
    ),
    runMatcherStep('manual-override-preload', { ...requestMeta, placeCount: placeIds.length }, () =>
      loadManualOverrides(supabase, placeIds),
    ),
    runMatcherStep('activity-evidence-preload', { ...requestMeta, placeCount: placeIds.length }, () =>
      loadPlaceActivityEvidence(supabase, placeIds),
    ),
  ]);

  const summary: MatchSummary = {
    processed: places.length,
    matches: 0,
    upserts: 0,
    deletes: 0,
    hospitalityKeywordDeletes: 0,
    eventEvidenceProtectedMatches: 0,
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
      const activityEvidenceIds = activityEvidenceByPlaceId.get(place.id) ?? new Set<number>();
      const result = computeMatchesForPlace({
        place,
        catalog,
        fsqCategories,
        manualOverrides,
        activityEvidenceIds,
        nowIso,
      });

      summary.matches += result.matches.size;
      summary.upserts += result.upserts.length;
      summary.deletes += result.deletes.length;
      summary.hospitalityKeywordDeletes += result.hospitalityKeywordDeletes;
      summary.eventEvidenceProtectedMatches += result.eventEvidenceProtectedMatches;
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
      logMatcherWarn('place-processing-failed', {
        placeId: place.id,
        name: place.name,
        city: place.city ?? null,
        locality: place.locality ?? null,
        categories: describeArrayLike(place.categories),
        tags: describeArrayLike(place.tags),
        metadataType: place.metadata == null ? 'nullish' : typeof place.metadata,
        error: getErrorMessage(error),
      });
      summary.errors.push({ placeId: place.id, message: getErrorMessage(error) });
    }
  }

  logMatcherInfo('run:complete', {
    ...requestMeta,
    processed: summary.processed,
    matches: summary.matches,
    upserts: summary.upserts,
    deletes: summary.deletes,
    errors: summary.errors.length,
  });

  return summary;
}

type PlaceMatchContext = {
  place: PlaceRow;
  catalog: ActivityCatalogRow[];
  fsqCategories: Set<string>;
  manualOverrides: ManualOverrideRow[];
  activityEvidenceIds: Set<number>;
  nowIso: string;
};

function computeMatchesForPlace(context: PlaceMatchContext): PlaceMatchResult {
  const { place, catalog, fsqCategories, manualOverrides, activityEvidenceIds, nowIso } = context;
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
  const boundary = evaluateActivityFirstDiscoveryPolicy({
    name: place.name,
    description: place.description,
    categories: place.categories,
    tags: place.tags,
    hasManualOverride: manualOverrides.length > 0,
    hasEventOrSessionEvidence: activityEvidenceIds.size > 0,
  });
  const matchingPolicy: ActivityMatchingPolicy = {
    allowKeywordMatch: !boundary.isHospitalityPrimary || boundary.hasActivityCategoryEvidence,
    activityEvidenceIds,
  };

  catalog.forEach((activity) => {
    if (typeof activity.id !== 'number') return;
    const match = evaluateActivityMatch(activity, searchIndex, fsqCategories, matchingPolicy);
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

  const hospitalityKeywordDeletes = boundary.isHospitalityPrimary
    ? deletes.filter((activityId) => existingMap.get(activityId)?.source === 'keyword' && !activityEvidenceIds.has(activityId)).length
    : 0;
  const eventEvidenceProtectedMatches = Array.from(matches.values()).filter((match) => match.usedEventEvidence).length;

  return {
    matches,
    upserts,
    deletes,
    hospitalityKeywordDeletes,
    eventEvidenceProtectedMatches,
    manualCount,
  };
}

function evaluateActivityMatch(
  activity: ActivityCatalogRow,
  searchIndex: SearchIndex,
  fsqCategories: Set<string>,
  policy: ActivityMatchingPolicy = { allowKeywordMatch: true, activityEvidenceIds: new Set<number>() },
): ActivityMatch | null {
  const fsqMatch = findFsqCategoryMatch(activity, fsqCategories);
  if (fsqMatch) {
    return { activityId: activity.id, source: 'category', confidence: CATEGORY_CONFIDENCE, detail: fsqMatch };
  }

  const hasEventEvidence = policy.activityEvidenceIds.has(activity.id);
  if (!policy.allowKeywordMatch && !hasEventEvidence) return null;

  const keywordMatch = findKeywordMatch(activity, searchIndex);
  if (keywordMatch) {
    return {
      activityId: activity.id,
      source: 'keyword',
      confidence: KEYWORD_CONFIDENCE,
      detail: keywordMatch,
      usedEventEvidence: !policy.allowKeywordMatch && hasEventEvidence,
    };
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
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
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
  const selectClause =
    `id,name,description,categories,tags,metadata,city,locality,foursquare_id,updated_at,venue_activities!left(activity_id,source,confidence)`;
  const applyCityFilter = <T extends {
    or: (value: string) => T;
    gte: (column: string, value: number) => T;
    lte: (column: string, value: number) => T;
  }>(query: T): T => {
    if (!options.city) return query;
    const normalizedCity = options.city.trim();
    if (!normalizedCity.length) return query;
    const scope = resolveCityScope(normalizedCity);
    if (scope) {
      return query
        .gte('lat', scope.bbox.sw.lat)
        .lte('lat', scope.bbox.ne.lat)
        .gte('lng', scope.bbox.sw.lng)
        .lte('lng', scope.bbox.ne.lng);
    }
    const escaped = normalizedCity.replace(/[%_,]/g, (match) => `\\${match}`);
    return query.or(`city.ilike.%${escaped}%,locality.ilike.%${escaped}%`);
  };

  if (options.placeId) {
    let query = client
      .from('places')
      .select(selectClause)
      .eq('id', options.placeId)
      .limit(1);
    query = applyCityFilter(query);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as PlaceRow[];
  }

  if (options.placeIds?.length) {
    const ids = Array.from(
      new Set(
        options.placeIds
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    if (!ids.length) return [];
    const rows: PlaceRow[] = [];
    const chunkSize = 180;
    for (let index = 0; index < ids.length; index += chunkSize) {
      const chunk = ids.slice(index, index + chunkSize);
      let query = client
        .from('places')
        .select(selectClause)
        .in('id', chunk);
      query = applyCityFilter(query);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...((data ?? []) as PlaceRow[]));
    }
    rows.sort((a, b) => {
      const aTs = a.updated_at ? Date.parse(a.updated_at) : 0;
      const bTs = b.updated_at ? Date.parse(b.updated_at) : 0;
      return bTs - aTs;
    });
    return rows;
  }

  const limit = clampLimit(options.limit ?? 100);
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  let query = client
    .from('places')
    .select(selectClause)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);
  query = applyCityFilter(query);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PlaceRow[];
}

async function loadFoursquareCategoryMap(client: SupabaseClient, placeIds: string[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (!placeIds.length) return map;
  const uniqueIds = Array.from(new Set(placeIds));
  for (const chunk of chunkValues(uniqueIds, MATCHER_QUERY_CHUNK_SIZE)) {
    const { data, error } = await client
      .from('place_sources')
      .select('place_id, raw')
      .eq('provider', 'foursquare')
      .in('place_id', chunk);
    if (error) throw error;
    (data as FoursquareSourceRow[] | null)?.forEach((row) => {
      const ids = extractFsqCategoryIds(row.raw);
      if (!ids.length) return;
      const entry = map.get(row.place_id) ?? new Set<string>();
      ids.forEach((id) => entry.add(id));
      map.set(row.place_id, entry);
    });
  }
  return map;
}

async function loadManualOverrides(client: SupabaseClient, placeIds: string[]): Promise<Map<string, ManualOverrideRow[]>> {
  const map = new Map<string, ManualOverrideRow[]>();
  if (!placeIds.length) return map;
  const uniqueIds = Array.from(new Set(placeIds));
  for (const chunk of chunkValues(uniqueIds, MATCHER_QUERY_CHUNK_SIZE)) {
    const { data, error } = await client
      .from('activity_manual_overrides')
      .select('activity_id, venue_id, reason')
      .in('venue_id', chunk);
    if (error) throw error;
    (data as ManualOverrideRow[] | null)?.forEach((row) => {
      if (!map.has(row.venue_id)) {
        map.set(row.venue_id, []);
      }
      map.get(row.venue_id)!.push(row);
    });
  }
  return map;
}

async function loadPlaceActivityEvidence(client: SupabaseClient, placeIds: string[]): Promise<Map<string, Set<number>>> {
  const map = new Map<string, Set<number>>();
  const uniqueIds = Array.from(new Set(placeIds.filter(Boolean)));
  if (!uniqueIds.length) return map;

  const sessionRows: SessionEvidenceRow[] = [];
  for (const chunk of chunkValues(uniqueIds, MATCHER_QUERY_CHUNK_SIZE)) {
    const { data, error } = await client
      .from('sessions')
      .select('place_id,activity_id')
      .in('place_id', chunk)
      .not('activity_id', 'is', null)
      .returns<SessionEvidenceRow[]>();
    if (error) throw error;
    if (data?.length) sessionRows.push(...data);
  }

  const activityIds = Array.from(
    new Set(
      sessionRows
        .map((row) => row.activity_id)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    ),
  );
  if (!activityIds.length) return map;

  const activityEvidenceMap = await loadActivityEvidenceLookup(client, activityIds);
  sessionRows.forEach((row) => {
    if (!row.place_id || !row.activity_id) return;
    const evidenceIds = activityEvidenceMap.get(row.activity_id);
    if (!evidenceIds?.size) return;
    const bucket = map.get(row.place_id) ?? new Set<number>();
    evidenceIds.forEach((activityId) => bucket.add(activityId));
    map.set(row.place_id, bucket);
  });

  return map;
}

async function loadActivityEvidenceLookup(
  client: SupabaseClient,
  activityIds: string[],
): Promise<Map<string, Set<number>>> {
  const map = new Map<string, Set<number>>();
  if (!activityIds.length) return map;

  const rows: ActivityEvidenceRow[] = [];
  let includeCatalogActivityId = true;
  // Generated DB types do not currently model the legacy activities table well enough
  // for typed select parsing here, so keep this lookup intentionally untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activitiesTable = client.from('activities') as any;

  for (const chunk of chunkValues(activityIds, MATCHER_QUERY_CHUNK_SIZE)) {
    let result = await activitiesTable
      .select(includeCatalogActivityId ? 'id,catalog_activity_id,name,tags' : 'id,name,tags')
      .in('id', chunk);
    if (
      result.error &&
      includeCatalogActivityId &&
      isMissingColumnError(result.error, 'catalog_activity_id')
    ) {
      includeCatalogActivityId = false;
      result = await activitiesTable
        .select('id,name,tags')
        .in('id', chunk);
    }
    if (result.error) throw result.error;
    const data = result.data as ActivityEvidenceRow[] | null;
    if (data?.length) rows.push(...data);
  }

  rows.forEach((row) => {
    const ids = new Set<number>();
    if (typeof row.catalog_activity_id === 'number' && Number.isFinite(row.catalog_activity_id)) {
      ids.add(row.catalog_activity_id);
    }
    inferCatalogActivityIdsFromText([row.name ?? null, ...(row.tags ?? [])]).forEach((activityId) => ids.add(activityId));
    if (ids.size) {
      map.set(row.id, ids);
    }
  });

  return map;
}

function inferCatalogActivityIdsFromText(values: Array<string | null | undefined>): Set<number> {
  const normalized = normalizeSearchString(values.filter((value): value is string => typeof value === 'string').join(' '));
  if (!normalized) return new Set<number>();
  const searchIndex: SearchIndex = {
    text: ` ${normalized} `,
    tokens: new Set(normalized.split(' ')),
    empty: false,
  };
  const result = new Set<number>();
  ACTIVITY_CATALOG_PRESETS.forEach((activity) => {
    const keywordMatch = (activity.keywords ?? []).some((keyword) => matchesKeyword(searchIndex, keyword));
    const slugMatch = matchesKeyword(searchIndex, activity.slug.replace(/-/g, ' '));
    const nameMatch = matchesKeyword(searchIndex, activity.name);
    if (keywordMatch || slugMatch || nameMatch) {
      result.add(activity.id);
    }
  });
  return result;
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

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? (error as { code?: string | null }).code : null;
  const message = 'message' in error ? (error as { message?: string | null }).message : null;
  const hint = 'hint' in error ? (error as { hint?: string | null }).hint : null;
  if (code !== '42703') return false;
  const haystack = `${message ?? ''} ${hint ?? ''}`.toLowerCase();
  return haystack.includes(columnName.toLowerCase());
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 50;
  return Math.min(2000, Math.max(1, Math.floor(value)));
}

export const __activityMatchingTestUtils = {
  computeMatchesForPlace,
  evaluateActivityMatch,
  buildSearchIndex,
  inferCatalogActivityIdsFromText,
  resolveCityScope,
};
