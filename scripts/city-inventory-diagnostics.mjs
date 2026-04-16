#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { buildCityInventoryReport } from './city-inventory-audit.mjs';
import {
  LAUNCH_CITY_CONFIG,
  matchesCurrentLaunchCityScope,
  matchesLaunchCityAliasScope,
  matchesLegacyCityStringScope,
  normalizeScopeValue,
  resolveLaunchCityKey,
} from './utils/launch-city-config.mjs';
import loadEnv from './utils/load-env.mjs';

loadEnv(['.env.local', 'apps/doWhat-web/.env.local', 'apps/doWhat-mobile/.env.local']);

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 180;
const DEFAULT_SAMPLE_LIMIT = 8;
const DEFAULT_PACK_VERSION = process.env.SEED_PACK_VERSION || '2026-03-04.v1';
const SESSION_EVIDENCE_WINDOW_DAYS = 365;

const HOSPITALITY_STEMS = [
  'bar',
  'beer',
  'bistro',
  'brew',
  'brunch',
  'cafe',
  'coffee',
  'cocktail',
  'dining',
  'drink',
  'food',
  'nightlife',
  'nightclub',
  'pub',
  'restaurant',
  'roaster',
  'tasting',
  'wine',
];

const ACTIVITY_STEMS = [
  'activity',
  'badminton',
  'board',
  'boulder',
  'bouldering',
  'boxing',
  'ceramic',
  'chess',
  'climb',
  'climbing',
  'community',
  'creative',
  'cycling',
  'dance',
  'dojo',
  'fitness',
  'gym',
  'hike',
  'martial',
  'meetup',
  'outdoor',
  'padel',
  'park',
  'pilates',
  'run',
  'running',
  'session',
  'sport',
  'sports',
  'studio',
  'swim',
  'tennis',
  'trail',
  'wellness',
  'workshop',
  'yoga',
];

const ACTIVITY_HINTS = {
  climbing: ['climb', 'climbing', 'rock climbing'],
  bouldering: ['boulder', 'bouldering'],
  yoga: ['yoga', 'meditation', 'stretching'],
  running: ['run', 'running', 'jogging', 'track'],
  padel: ['padel', 'pádel'],
  chess: ['chess', 'board game', 'cờ vua', 'หมากรุก'],
};

const pickEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

const normalizeToken = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');

const uniq = (values) => Array.from(new Set(values.filter(Boolean)));

const chunk = (values, size) => {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
};

const tokenIncludesStem = (token, stems) =>
  stems.some((stem) => token === stem || token.startsWith(`${stem}_`) || token.endsWith(`_${stem}`));

const inferActivitySlugsFromText = (...values) => {
  const text = normalizeToken(values.filter(Boolean).join(' '));
  if (!text) return [];
  return Object.entries(ACTIVITY_HINTS)
    .filter(([, hints]) => hints.some((hint) => text.includes(normalizeToken(hint).replace(/_/g, ' '))))
    .map(([slug]) => slug);
};

const evaluatePlaceBoundary = (place) => {
  const providerCategories = Array.isArray(place.providerCategories) ? place.providerCategories.flatMap((entry) => entry ?? []) : [];
  const tokens = uniq([
    ...(place.categories ?? []),
    ...(place.tags ?? []),
    ...providerCategories,
  ].map(normalizeToken));

  const hasHospitalitySignals = tokens.some((token) => tokenIncludesStem(token, HOSPITALITY_STEMS));
  const hasActivityCategoryEvidence = tokens.some((token) => tokenIncludesStem(token, ACTIVITY_STEMS));

  return {
    hasHospitalitySignals,
    hasActivityCategoryEvidence,
    isHospitalityPrimary: hasHospitalitySignals && !hasActivityCategoryEvidence,
  };
};

const createRestContext = () => {
  const supabaseUrl = pickEnv('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL');
  const serviceRoleKey = pickEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for diagnostics.');
  }
  return {
    url: supabaseUrl.replace(/\/+$/, ''),
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  };
};

const fetchRestPage = async (context, path, { from = 0, to = PAGE_SIZE - 1, head = false } = {}) => {
  const response = await fetch(`${context.url}/rest/v1/${path}`, {
    method: head ? 'HEAD' : 'GET',
    headers: {
      ...context.headers,
      Range: `${from}-${to}`,
      Prefer: 'count=exact',
    },
  });

  if (!response.ok) {
    const body = head ? '' : await response.text();
    throw new Error(`Supabase REST request failed (${response.status}) for ${path}: ${body}`);
  }

  const contentRange = response.headers.get('content-range');
  const totalMatch = contentRange?.match(/\/(\d+)$/);
  const total = totalMatch ? Number.parseInt(totalMatch[1], 10) : null;
  const rows = head ? [] : await response.json();
  return { rows, total };
};

const fetchAllRestRows = async (context, path) => {
  const first = await fetchRestPage(context, path, { from: 0, to: PAGE_SIZE - 1 });
  const rows = [...first.rows];
  const total = first.total ?? rows.length;
  for (let from = rows.length; from < total; from += PAGE_SIZE) {
    const page = await fetchRestPage(context, path, { from, to: from + PAGE_SIZE - 1 });
    rows.push(...page.rows);
  }
  return rows;
};

const queryCityPlacesViaRest = async (context, cityKey) => {
  const config = LAUNCH_CITY_CONFIG[cityKey];
  const query = [
    'places?select=id,name,city,locality,region,country,lat,lng,categories,tags,primary_source',
    `lat=gte.${config.bbox.sw.lat}`,
    `lat=lte.${config.bbox.ne.lat}`,
    `lng=gte.${config.bbox.sw.lng}`,
    `lng=lte.${config.bbox.ne.lng}`,
    'order=name.asc',
  ].join('&');

  const rows = await fetchAllRestRows(context, query);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    city: row.city ?? null,
    locality: row.locality ?? null,
    region: row.region ?? null,
    country: row.country ?? null,
    lat: Number(row.lat),
    lng: Number(row.lng),
    categories: Array.isArray(row.categories) ? row.categories : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    primarySource: row.primary_source ?? null,
    mappings: [],
    manualOverrides: [],
    sessionEvidenceSlugs: [],
    providerCategories: [],
    manualOverrideSlugs: [],
    mappedActivitySlugs: new Set(),
    coveredActivitySlugs: new Set(),
  }));
};

const fetchActivitySlugMap = async (context, ids, cache = new Map()) => {
  const missingIds = ids.filter((id) => !cache.has(id));
  for (const idsChunk of chunk(missingIds, CHUNK_SIZE)) {
    const query = `activity_catalog?select=id,slug&id=in.(${idsChunk.join(',')})`;
    const rows = await fetchAllRestRows(context, query);
    rows.forEach((row) => {
      if (typeof row.id === 'number' && typeof row.slug === 'string') {
        cache.set(row.id, row.slug);
      }
    });
  }
  return cache;
};

const attachMappingsViaRest = async (context, placesById, activitySlugCache) => {
  const ids = Array.from(placesById.keys());
  const activityIds = new Set();
  const rawRows = [];
  for (const idsChunk of chunk(ids, CHUNK_SIZE)) {
    const query = `venue_activities?select=venue_id,activity_id,source,confidence,matched_at&venue_id=in.(${idsChunk.join(',')})`;
    const rows = await fetchAllRestRows(context, query);
    rows.forEach((row) => {
      rawRows.push(row);
      if (typeof row.activity_id === 'number') activityIds.add(row.activity_id);
    });
  }

  const slugMap = await fetchActivitySlugMap(context, Array.from(activityIds), activitySlugCache);
  rawRows.forEach((row) => {
    const place = placesById.get(row.venue_id);
    if (!place) return;
    const slug = slugMap.get(row.activity_id);
    if (!slug) return;
    place.mappings.push({
      activityId: row.activity_id,
      slug,
      source: row.source,
      confidence: typeof row.confidence === 'number' ? row.confidence : null,
      matchedAt: row.matched_at ?? null,
    });
  });
};

const attachManualOverridesViaRest = async (context, placesById, activitySlugCache) => {
  const ids = Array.from(placesById.keys());
  const activityIds = new Set();
  const rawRows = [];
  for (const idsChunk of chunk(ids, CHUNK_SIZE)) {
    const query = `activity_manual_overrides?select=venue_id,activity_id,reason&venue_id=in.(${idsChunk.join(',')})`;
    const rows = await fetchAllRestRows(context, query);
    rows.forEach((row) => {
      rawRows.push(row);
      if (typeof row.activity_id === 'number') activityIds.add(row.activity_id);
    });
  }

  const slugMap = await fetchActivitySlugMap(context, Array.from(activityIds), activitySlugCache);
  rawRows.forEach((row) => {
    const place = placesById.get(row.venue_id);
    if (!place) return;
    const slug = slugMap.get(row.activity_id);
    if (!slug) return;
    place.manualOverrides.push({
      activityId: row.activity_id,
      slug,
      reason: row.reason ?? null,
    });
  });
};

const attachPlaceSourcesViaRest = async (context, placesById) => {
  const ids = Array.from(placesById.keys());
  for (const idsChunk of chunk(ids, CHUNK_SIZE)) {
    const query = `place_sources?select=place_id,categories,provider&place_id=in.(${idsChunk.join(',')})`;
    const rows = await fetchAllRestRows(context, query);
    rows.forEach((row) => {
      const place = placesById.get(row.place_id);
      if (!place) return;
      if (Array.isArray(row.categories) && row.categories.length) {
        place.providerCategories.push(row.categories);
      }
      if (typeof row.provider === 'string') {
        place.providerSourceRows = place.providerSourceRows ?? [];
        place.providerSourceRows.push(row.provider);
      }
    });
  }
};

const attachSessionEvidenceViaRest = async (context, placesById, sessionWindowDays, activitySlugCache) => {
  const ids = Array.from(placesById.keys());
  const activityIds = new Set();
  const now = Date.now();
  const cutoff = new Date(now - sessionWindowDays * 24 * 60 * 60 * 1000).toISOString();
  const rawRows = [];

  for (const idsChunk of chunk(ids, CHUNK_SIZE)) {
    const query = `sessions?select=place_id,activity_id,starts_at,created_at&place_id=in.(${idsChunk.join(',')})`;
    const rows = await fetchAllRestRows(context, query);
    rows.forEach((row) => {
      const reference = row.starts_at ?? row.created_at;
      if (!reference || reference < cutoff) return;
      rawRows.push(row);
      if (typeof row.activity_id === 'string') activityIds.add(row.activity_id);
    });
  }

  const activityRows = [];
  for (const idsChunk of chunk(Array.from(activityIds), CHUNK_SIZE)) {
    const query = `activities?select=id,catalog_activity_id,name,tags&id=in.(${idsChunk.join(',')})`;
    const rows = await fetchAllRestRows(context, query);
    activityRows.push(...rows);
  }
  const activityMap = new Map(activityRows.map((row) => [row.id, row]));

  const catalogIds = uniq(activityRows.map((row) => row.catalog_activity_id).filter((value) => typeof value === 'number'));
  const catalogSlugMap = await fetchActivitySlugMap(context, catalogIds, activitySlugCache);

  rawRows.forEach((row) => {
    const place = placesById.get(row.place_id);
    const activity = activityMap.get(row.activity_id);
    if (!place || !activity) return;
    const slugs = uniq([
      typeof activity.catalog_activity_id === 'number' ? catalogSlugMap.get(activity.catalog_activity_id) : '',
      ...inferActivitySlugsFromText(activity.name ?? '', ...(Array.isArray(activity.tags) ? activity.tags : [])),
    ]);
    place.sessionEvidenceSlugs.push(...slugs);
  });

  placesById.forEach((place) => {
    place.sessionEvidenceSlugs = uniq(place.sessionEvidenceSlugs).sort();
  });
};

const loadSeedMetricsViaRest = async (rows, cityKey, packVersion) => {
  return buildSeedStageDiagnostics({
    city: cityKey,
    packVersion,
    rows,
  });
};

export const matchesCurrentCityScope = (place, cityKey) => matchesCurrentLaunchCityScope(place, cityKey);

export const matchesNormalizedCityScope = (place, cityKey) => matchesLaunchCityAliasScope(place, cityKey);

export const matchesLegacyStringCityScope = (place, cityKey) => matchesLegacyCityStringScope(place, cityKey);

const summarizeTopCityLocalityPairs = (places, sampleLimit) => {
  const counts = new Map();
  places.forEach((place) => {
    const key = `${place.city ?? '(null)'} | ${place.locality ?? '(null)'}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, sampleLimit)
    .map(([label, count]) => ({ label, count }));
};

const summarizeProviderCounts = (places) => {
  return places.reduce(
    (acc, place) => {
      if (place.primarySource === 'openstreetmap') acc.openstreetmap += 1;
      if (place.primarySource === 'foursquare') acc.foursquare += 1;
      if (place.primarySource === 'google_places') acc.google_places += 1;
      return acc;
    },
    { openstreetmap: 0, foursquare: 0, google_places: 0 },
  );
};

const summarizeProviderSourceRows = (places) => {
  return places.reduce(
    (acc, place) => {
      (place.providerSourceRows ?? []).forEach((provider) => {
        if (provider === 'openstreetmap') acc.openstreetmap += 1;
        if (provider === 'foursquare') acc.foursquare += 1;
        if (provider === 'google_places') acc.google_places += 1;
      });
      return acc;
    },
    { openstreetmap: 0, foursquare: 0, google_places: 0 },
  );
};

const gradeScopeRatio = (ratio) => {
  if (ratio >= 0.6) return 'acceptable';
  if (ratio >= 0.2) return 'suspicious';
  return 'failing';
};

const gradeNullRatio = (ratio) => {
  if (ratio <= 0.15) return 'acceptable';
  if (ratio <= 0.35) return 'suspicious';
  return 'failing';
};

const gradeEligibleRatio = (ratio) => {
  if (ratio >= 0.12) return 'acceptable';
  if (ratio >= 0.05) return 'suspicious';
  return 'failing';
};

const buildWeakMappingSamples = (places, sampleLimit) => {
  return places
    .filter((place) => place.weakMappings.length > 0)
    .slice(0, sampleLimit)
    .map((place) => ({
      placeId: place.id,
      name: place.name,
      weakMappings: place.weakMappings.map((mapping) => mapping.slug),
      city: place.city ?? place.locality ?? null,
    }));
};

export const buildSeedStageDiagnostics = ({ city, packVersion, rows }) => {
  const prefix = `seed:${packVersion}:${city}:`;
  const providerCounts = { openstreetmap: 0, foursquare: 0, google_places: 0 };
  const rejectedByReason = {};
  const packEntryCounts = {};
  const tilesTouched = new Set();
  const packsSeen = new Set();
  let cacheEntries = 0;
  let fetchedCount = 0;
  let dedupedCount = 0;
  let gatedCount = 0;
  let filteredCount = 0;

  rows.forEach((row) => {
    const cache = row.discovery_cache;
    if (!cache || typeof cache !== 'object' || Array.isArray(cache)) return;
    Object.entries(cache).forEach(([key, value]) => {
      if (!key.startsWith(prefix)) return;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      cacheEntries += 1;
      tilesTouched.add(row.geohash6);
      const pack = typeof value.pack === 'string' ? value.pack : 'unknown';
      packsSeen.add(pack);
      packEntryCounts[pack] = (packEntryCounts[pack] ?? 0) + 1;
      const explain = value.explain && typeof value.explain === 'object' ? value.explain : {};
      const counts = value.providerCounts ?? value.provider_counts ?? {};
      providerCounts.openstreetmap += Number(counts.openstreetmap ?? 0) || 0;
      providerCounts.foursquare += Number(counts.foursquare ?? 0) || 0;
      providerCounts.google_places += Number(counts.google_places ?? 0) || 0;
      fetchedCount += Number(explain.itemsBeforeDedupe ?? 0) || 0;
      dedupedCount += Number(explain.itemsAfterDedupe ?? 0) || 0;
      gatedCount += Number(explain.itemsAfterGates ?? 0) || 0;
      filteredCount += Number(explain.itemsAfterFilters ?? 0) || 0;
      const dropReasons = explain.dropReasons && typeof explain.dropReasons === 'object' ? explain.dropReasons : {};
      Object.entries(dropReasons).forEach(([reason, count]) => {
        const value = Number(count) || 0;
        rejectedByReason[reason] = (rejectedByReason[reason] ?? 0) + value;
      });
    });
  });

  return {
    cacheEntries,
    tilesTouched: tilesTouched.size,
    packsSeen: Array.from(packsSeen).sort((left, right) => left.localeCompare(right)),
    packEntryCounts,
    fetchedCount,
    dedupedCount,
    gatedCount,
    filteredCount,
    rejectedCount: Math.max(0, fetchedCount - filteredCount),
    rejectedByReason,
    hospitalityRejectedCount: (rejectedByReason.blockedHospitality ?? 0) + (rejectedByReason.hospitalityOnly ?? 0),
    providerCounts,
  };
};

export const buildCityScopeDiagnostics = ({ city, places, sampleLimit = DEFAULT_SAMPLE_LIMIT }) => {
  const currentScopePlaces = places.filter((place) => matchesCurrentCityScope(place, city));
  const normalizedScopePlaces = places.filter((place) => matchesNormalizedCityScope(place, city));
  const legacyStringScopePlaces = places.filter((place) => matchesLegacyStringCityScope(place, city));
  const nullCityFieldPlaces = places.filter((place) => !(place.city || place.locality));
  const normalizedOnlyPlaces = normalizedScopePlaces.filter((place) => !matchesLegacyStringCityScope(place, city));
  const districtOrOtherLocalityPlaces = places.filter(
    (place) => !matchesNormalizedCityScope(place, city) && !matchesLegacyStringCityScope(place, city) && (place.city || place.locality),
  );

  const ratio = places.length ? currentScopePlaces.length / places.length : 0;
  const normalizedRatio = places.length ? normalizedScopePlaces.length / places.length : 0;
  const legacyStringRatio = places.length ? legacyStringScopePlaces.length / places.length : 0;
  const nullRatio = places.length ? nullCityFieldPlaces.length / places.length : 0;

  return {
    bboxPlaceCount: places.length,
    currentScopeCount: currentScopePlaces.length,
    legacyStringScopeCount: legacyStringScopePlaces.length,
    normalizedScopeCount: normalizedScopePlaces.length,
    nullCityFieldsCount: nullCityFieldPlaces.length,
    currentScopeMissCount: Math.max(0, places.length - currentScopePlaces.length),
    normalizedFalseNegativeCount: Math.max(0, normalizedScopePlaces.length - legacyStringScopePlaces.length),
    districtOrOtherLocalityCount: districtOrOtherLocalityPlaces.length,
    currentScopeRatio: Number(ratio.toFixed(3)),
    legacyStringScopeRatio: Number(legacyStringRatio.toFixed(3)),
    normalizedScopeRatio: Number(normalizedRatio.toFixed(3)),
    nullCityFieldsRatio: Number(nullRatio.toFixed(3)),
    statuses: {
      currentScope: gradeScopeRatio(ratio),
      legacyStringScope: gradeScopeRatio(legacyStringRatio),
      normalizedScope: gradeScopeRatio(normalizedRatio),
      nullCityFields: gradeNullRatio(nullRatio),
    },
    topCityLocalityPairs: summarizeTopCityLocalityPairs(places, sampleLimit),
    currentScopeSamples: currentScopePlaces.slice(0, sampleLimit).map((place) => ({
      placeId: place.id,
      name: place.name,
      city: place.city ?? null,
      locality: place.locality ?? null,
    })),
    normalizedOnlySamples: normalizedOnlyPlaces.slice(0, sampleLimit).map((place) => ({
      placeId: place.id,
      name: place.name,
      city: place.city ?? null,
      locality: place.locality ?? null,
    })),
    districtOrOtherLocalitySamples: districtOrOtherLocalityPlaces.slice(0, sampleLimit).map((place) => ({
      placeId: place.id,
      name: place.name,
      city: place.city ?? null,
      locality: place.locality ?? null,
    })),
  };
};

const enrichPlacesForDiagnostics = (places) => {
  const prepared = places.map((place) => {
    const boundary = evaluatePlaceBoundary(place);
    const manualOverrideSlugs = uniq(place.manualOverrides.map((override) => override.slug));
    const sessionEvidenceSlugs = uniq(place.sessionEvidenceSlugs);
    const mappedActivitySlugs = new Set(place.mappings.map((mapping) => mapping.slug));
    const coveredActivitySlugs = new Set([...mappedActivitySlugs, ...sessionEvidenceSlugs]);

    const weakMappings = [];
    place.mappings.forEach((mapping) => {
      const hasManualSupport = manualOverrideSlugs.includes(mapping.slug);
      const hasSessionSupport = sessionEvidenceSlugs.includes(mapping.slug);
      const hasStrongEvidence = hasManualSupport || hasSessionSupport || mapping.source === 'category';
      const isWeakKeyword = mapping.source === 'keyword' && !hasStrongEvidence && !boundary.hasActivityCategoryEvidence;
      if (isWeakKeyword) weakMappings.push(mapping);
    });

    return {
      ...place,
      boundary,
      manualOverrideSlugs,
      sessionEvidenceSlugs,
      mappedActivitySlugs,
      coveredActivitySlugs,
      weakMappings,
      activityEligible:
        manualOverrideSlugs.length > 0
        || sessionEvidenceSlugs.length > 0
        || place.mappings.some((mapping) => mapping.source === 'manual' || mapping.source === 'category')
        || boundary.hasActivityCategoryEvidence,
    };
  });

  return prepared;
};

export const buildInventoryStageDiagnostics = ({ places, sampleLimit = DEFAULT_SAMPLE_LIMIT }) => {
  const prepared = enrichPlacesForDiagnostics(places);
  const mappedCount = prepared.filter((place) => place.mappings.length > 0).length;
  const unmatchedCount = prepared.length - mappedCount;
  const activityEligiblePlaces = prepared.filter((place) => place.activityEligible);
  const hospitalityPrimaryPlaces = prepared.filter((place) => place.boundary.isHospitalityPrimary);
  const hospitalityRejectedPlaces = hospitalityPrimaryPlaces.filter(
    (place) => place.manualOverrideSlugs.length === 0 && place.sessionEvidenceSlugs.length === 0 && place.mappings.length === 0,
  );
  const weakKeywordOnlyPlaces = prepared.filter((place) => place.weakMappings.length > 0);

  return {
    prepared,
    summary: {
      providerCounts: summarizeProviderCounts(prepared),
      providerSourceCounts: summarizeProviderSourceRows(prepared),
      mappedCount,
      unmatchedCount,
      mappingCoverageRatio: prepared.length ? Number((mappedCount / prepared.length).toFixed(3)) : 0,
      activityEligibleCount: activityEligiblePlaces.length,
      hospitalityPrimaryCount: hospitalityPrimaryPlaces.length,
      hospitalityRejectedCount: hospitalityRejectedPlaces.length,
      weakKeywordOnlyCount: weakKeywordOnlyPlaces.length,
      manualOverridePlaces: prepared.filter((place) => place.manualOverrides.length > 0).length,
      activityEligibleRatio: prepared.length ? Number((activityEligiblePlaces.length / prepared.length).toFixed(3)) : 0,
      statuses: {
        activityEligible: gradeEligibleRatio(prepared.length ? activityEligiblePlaces.length / prepared.length : 0),
      },
      hospitalityRejectedSamples: hospitalityRejectedPlaces.slice(0, sampleLimit).map((place) => ({
        placeId: place.id,
        name: place.name,
        city: place.city ?? place.locality ?? null,
      })),
      weakMappingSamples: buildWeakMappingSamples(prepared, sampleLimit),
    },
  };
};

const buildRootCauseSummary = ({ city, seed, scope, inventory, audit, packVersion }) => {
  const causes = [];

  if (scope.currentScopeCount <= Math.max(1, Math.floor(scope.bboxPlaceCount * 0.02))) {
    causes.push({
      rank: 1,
      key: 'city_scope_collapse',
      status: 'proven',
      summary: `Current rematch scope only sees ${scope.currentScopeCount}/${scope.bboxPlaceCount} canonical places in ${LAUNCH_CITY_CONFIG[city].label}.`,
      evidence: 'city selection is still collapsing below bbox truth',
    });
  }

  if (seed.cacheEntries === 0) {
    causes.push({
      rank: causes.length + 1,
      key: 'missing_target_city_seed_cache',
      status: 'proven',
      summary: `No seed cache entries were found for ${LAUNCH_CITY_CONFIG[city].label} under pack version ${packVersion}.`,
      evidence: 'place_tiles.discovery_cache does not contain seed:<packVersion>:<city>:* entries for this city',
    });
  }

  if (scope.normalizedScopeCount > scope.legacyStringScopeCount) {
    causes.push({
      rank: causes.length + 1,
      key: 'city_normalization_false_negatives',
      status: 'proven',
      summary: `${scope.normalizedScopeCount - scope.legacyStringScopeCount} additional places match city aliases after accent/spacing normalization.`,
      evidence: 'legacy raw slug matching still misses accent-folded or spaced city/locality values',
    });
  }

  if (scope.nullCityFieldsCount > 0) {
    causes.push({
      rank: causes.length + 1,
      key: 'missing_city_fields',
      status: 'proven',
      summary: `${scope.nullCityFieldsCount} canonical places inside the city bbox have null city/locality fields.`,
      evidence: 'rematch and audit tooling that rely on city/locality strings cannot select these rows directly',
    });
  }

  if (inventory.summary.mappedCount === 0 && inventory.summary.activityEligibleCount > 0) {
    causes.push({
      rank: causes.length + 1,
      key: 'zero_mapping_base',
      status: 'proven',
      summary: `${inventory.summary.activityEligibleCount} persisted places look activity-eligible, but 0 currently have venue_activities mappings.`,
      evidence: 'the canonical place base exists, but activity matching has not populated a usable mapped inventory for this city scope',
    });
  }

  if (seed.tilesTouched > 0 && seed.filteredCount > 0 && inventory.summary.activityEligibleCount > 0 && scope.currentScopeCount <= 1) {
    causes.push({
      rank: causes.length + 1,
      key: 'seed_to_matcher_disconnect',
      status: 'proven',
      summary: `Seed cache shows ${seed.filteredCount} filtered provider candidates, but the current rematch scope only loads ${scope.currentScopeCount} persisted city-scoped rows.`,
      evidence: 'the problem is downstream city scoping / persistence visibility, not purely provider fetch failure',
    });
  }

  if (inventory.summary.hospitalityRejectedCount > 0) {
    causes.push({
      rank: causes.length + 1,
      key: 'persisted_hospitality_noise',
      status: 'proven',
      summary: `${inventory.summary.hospitalityRejectedCount} bbox places are hospitality-primary with no mapping/session/manual support.`,
      evidence: 'canonical place inventory still contains non-activity rows that need better scoping or cleanup review',
    });
  }

  if (audit.overallStatus !== 'acceptable') {
    causes.push({
      rank: causes.length + 1,
      key: 'inventory_quality_gap',
      status: 'proven',
      summary: `Inventory audit remains ${audit.overallStatus}.`,
      evidence: 'coverage, leakage, weak mappings, duplicates, or session-to-mapping gaps still need review',
    });
  }

  return causes;
};

export const buildCityInventoryDiagnosticsReport = ({ city, seed, places, sampleLimit = DEFAULT_SAMPLE_LIMIT, packVersion = DEFAULT_PACK_VERSION }) => {
  const audit = buildCityInventoryReport({
    city,
    places,
    sampleLimit,
  });
  const scope = buildCityScopeDiagnostics({ city, places, sampleLimit });
  const inventory = buildInventoryStageDiagnostics({ places, sampleLimit });
  const rootCauses = buildRootCauseSummary({ city, seed, scope, inventory, audit, packVersion });

  return {
    city,
    label: LAUNCH_CITY_CONFIG[city].label,
    generatedAt: new Date().toISOString(),
    seed,
    scope,
    inventory: inventory.summary,
    audit,
    rootCauses,
    blindSpots: [
      'This report uses persisted place inventory and cached seed explain data; it does not prove real-world market completeness.',
      'Imported external events are still not treated as canonical activity-mapping evidence here.',
      'A DB-connected manual review is still required for suspicious samples and final launch sign-off.',
    ],
  };
};

const formatDiagnosticsReport = (reports, format) => {
  if (format === 'json') return JSON.stringify(reports, null, 2);

  const lines = [];
  reports.forEach((report) => {
    lines.push(`[city-inventory-diagnostics] ${report.label}`);
    lines.push(
      `  seed fetched=${report.seed.fetchedCount} deduped=${report.seed.dedupedCount}`
      + ` gated=${report.seed.gatedCount} filtered=${report.seed.filteredCount}`
      + ` rejected=${report.seed.rejectedCount}`,
    );
    lines.push(
      `  scope bbox=${report.scope.bboxPlaceCount} current=${report.scope.currentScopeCount}`
      + ` normalized=${report.scope.normalizedScopeCount} nullCityFields=${report.scope.nullCityFieldsCount}`,
    );
    lines.push(
      `  inventory mapped=${report.inventory.mappedCount} unmatched=${report.inventory.unmatchedCount}`
      + ` eligible=${report.inventory.activityEligibleCount} hospitalityRejected=${report.inventory.hospitalityRejectedCount}`,
    );
    report.rootCauses.forEach((cause) => {
      lines.push(`  rootCause[${cause.rank}] ${cause.key}: ${cause.summary}`);
    });
  });
  return lines.join('\n');
};

export const parseArgs = (argv) => {
  const result = {
    cities: [],
    all: false,
    format: 'table',
    output: '',
    packVersion: DEFAULT_PACK_VERSION,
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
    help: false,
  };

  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const [key, rawValue] = arg.slice(2).split('=');
    const value = (rawValue ?? '').trim();
    if (key === 'city' && value) result.cities.push(normalizeScopeValue(value));
    if (key === 'cities' && value) {
      result.cities.push(...value.split(',').map((entry) => normalizeScopeValue(entry)).filter(Boolean));
    }
    if (key === 'all') result.all = value !== '0' && value !== 'false';
    if (key === 'json') result.format = 'json';
    if (key === 'format' && value) result.format = value;
    if (key === 'output' && value) result.output = value;
    if (key === 'packVersion' && value) result.packVersion = value;
    if ((key === 'sampleLimit' || key === 'samples') && value) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) result.sampleLimit = parsed;
    }
    if (key === 'help' || key === 'h') result.help = true;
  });

  result.cities = result.all || result.cities.includes('all')
    ? Object.keys(LAUNCH_CITY_CONFIG)
    : uniq(
      result.cities
        .map((entry) =>
          resolveLaunchCityKey(entry) ?? '',
        )
        .filter(Boolean),
    );

  return result;
};

const printUsage = () => {
  console.log(`Usage:
  pnpm inventory:diagnose:city --city=hanoi
  pnpm inventory:diagnose:city --city=danang --json --output=artifacts/danang-diagnostics.json
  pnpm inventory:diagnose:cities --format=json --output=inventory-diagnostics.json

Environment:
  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Notes:
  - This report explains why city inventory appears thin, irrelevant, or blocked.
  - It uses seed cache explain data, bbox-scoped canonical places, and activity mapping evidence.
  - It does not replace the manual launch checklist.`);
};

const writeOutput = async (outputPath, content) => {
  if (!outputPath) return;
  await writeFile(outputPath, content, 'utf8');
};

export const runCityInventoryDiagnostics = async (options) => {
  const context = createRestContext();
  const activitySlugCache = new Map();
  const seedRows = await fetchAllRestRows(
    context,
    'place_tiles?select=geohash6,discovery_cache&discovery_cache=not.is.null',
  );
  const reports = [];
  for (const city of options.cities) {
    const places = await queryCityPlacesViaRest(context, city);
    const placesById = new Map(places.map((place) => [place.id, place]));
    await attachMappingsViaRest(context, placesById, activitySlugCache);
    await attachManualOverridesViaRest(context, placesById, activitySlugCache);
    await attachPlaceSourcesViaRest(context, placesById);
    await attachSessionEvidenceViaRest(context, placesById, SESSION_EVIDENCE_WINDOW_DAYS, activitySlugCache);
    const seed = await loadSeedMetricsViaRest(seedRows, city, options.packVersion);
    reports.push(
      buildCityInventoryDiagnosticsReport({
        city,
        seed,
        places,
        sampleLimit: options.sampleLimit,
        packVersion: options.packVersion,
      }),
    );
  }
  return reports;
};

export const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  if (!args.cities.length) {
    console.error('[city-inventory-diagnostics] Provide --city=hanoi|danang|bangkok or --all.');
    printUsage();
    process.exit(1);
  }

  const reports = await runCityInventoryDiagnostics(args);
  const payload = formatDiagnosticsReport(reports, args.format);
  console.log(payload);
  await writeOutput(args.output, payload);
};

const isDirectExecution = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
})();

if (isDirectExecution) {
  main().catch((error) => {
    console.error('[city-inventory-diagnostics] failed', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
