#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = process.env.HANOI_AUDIT_BASE_URL ?? 'http://localhost:3002';
const OUTPUT_ROOT = process.env.HANOI_CLIMB_AUDIT_OUTPUT_ROOT
  ?? path.resolve(process.cwd(), 'artifacts', 'hanoi-climb-completeness');
const TIMESTAMP = process.env.HANOI_CLIMB_AUDIT_TIMESTAMP ?? new Date().toISOString().replace(/[:.]/g, '-');
const OUTPUT_DIR = path.join(OUTPUT_ROOT, TIMESTAMP);
const HANOI_CENTER = { lat: 21.0285, lng: 105.8542 };
const HANOI_BBOX = {
  sw: { lat: 20.86, lng: 105.62 },
  ne: { lat: 21.26, lng: 106.10 },
};
const CURRENT_ARTIFACT_ROOT = path.resolve(process.cwd(), 'artifacts', 'hanoi-live-search-repro');
const CURRENT_VIEWPORT_DEFAULT = { center: HANOI_CENTER, strictRadiusMeters: 25_000, browseRadiusMeters: 2_500 };
const CLIMB_TOKENS = ['climb', 'climbing', 'boulder', 'bouldering', 'rock climbing', 'climbing gym', 'bouldering gym'];
const ENV_FILES = ['.env.local', 'apps/doWhat-web/.env.local'];
const HOSPITALITY_PATTERN = /\b(bar|cafe|coffee|restaurant|pub|lounge|cocktail|spa|massage|rooftop|shop|retail|mall|nightclub|hotel)\b/i;
const normalize = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
const unique = (values) => Array.from(new Set((values ?? []).filter(Boolean)));
const uniqueNormalized = (values) => Array.from(new Set((values ?? []).map((value) => normalize(value)).filter(Boolean)));
const round = (value, digits = 4) => (typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(digits)) : null);
const toJson = (value) => JSON.stringify(value, null, 2);

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function withinRadius(place, center, radiusMeters) {
  return haversineMeters(place.lat, place.lng, center.lat, center.lng) <= radiusMeters;
}

function containsClimbToken(value) {
  const haystack = normalize(value);
  return CLIMB_TOKENS.some((token) => haystack.includes(token));
}

function resolveCanonicalActivityId(value) {
  const normalized = normalize(value);
  if (!normalized) return null;
  if (normalized.includes('boulder')) return 'bouldering';
  if (normalized.includes('climb')) return 'climbing';
  return null;
}

function candidateHasActivity(candidateTypes, activityId) {
  const values = uniqueNormalized(candidateTypes);
  if (values.includes(activityId)) return true;
  if (activityId === 'climbing' && values.includes('bouldering')) return true;
  if (activityId === 'bouldering' && values.includes('climbing')) return true;
  return false;
}

function inferHeuristicActivityTypes(place, providerCategories = [], providerNames = []) {
  const haystack = uniqueNormalized([
    place.name,
    place.address,
    ...(place.tags ?? []),
    ...(place.categories ?? []),
    ...providerCategories,
    ...providerNames,
  ]).join(' ');
  const types = new Set();
  if (containsClimbToken(haystack)) types.add('climbing');
  if (haystack.includes('boulder')) types.add('bouldering');
  return Array.from(types);
}

function evaluateActivityFirstDiscoveryPolicy(input) {
  const values = [
    input.name,
    input.description,
    ...(input.categories ?? []),
    ...(input.tags ?? []),
    ...(input.activityTypes ?? []),
    ...(input.taxonomyCategories ?? []),
  ].filter(Boolean);
  const hasHospitalitySignals = values.some((value) => HOSPITALITY_PATTERN.test(String(value)));
  const hasActivityCategoryEvidence = values.some((value) => containsClimbToken(String(value)));
  const hasStructuredActivityEvidence = (input.activityTypes ?? []).length > 0;
  const hasVenueActivityMapping = Boolean(input.hasVenueActivityMapping);
  const hasManualOverride = Boolean(input.hasManualOverride);
  const hasEventOrSessionEvidence = Boolean(input.hasEventOrSessionEvidence);
  const isHospitalityPrimary = hasHospitalitySignals && !hasActivityCategoryEvidence;
  const evidenceSignals = [
    hasManualOverride ? 'manual_override' : null,
    hasEventOrSessionEvidence ? 'real_events_or_sessions' : null,
    hasVenueActivityMapping ? 'confirmed_venue_activity_mapping' : null,
    hasStructuredActivityEvidence ? 'structured_activity_signal' : null,
    hasActivityCategoryEvidence ? 'activity_supporting_category' : null,
  ].filter(Boolean);
  const hasEligibilityEvidence = hasActivityCategoryEvidence || hasStructuredActivityEvidence || hasVenueActivityMapping || hasManualOverride || hasEventOrSessionEvidence;
  const isEligible = isHospitalityPrimary
    ? hasManualOverride || hasEventOrSessionEvidence || hasVenueActivityMapping || hasStructuredActivityEvidence
    : hasEligibilityEvidence;
  return {
    isEligible,
    isHospitalityPrimary,
    hasHospitalitySignals,
    hasActivityCategoryEvidence,
    hasStructuredActivityEvidence,
    hasVenueActivityMapping,
    hasManualOverride,
    hasEventOrSessionEvidence,
    evidenceSignals,
  };
}

function escapeMarkdown(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

function readEnvFileValues(filePath) {
  const absolute = path.resolve(process.cwd(), filePath);
  if (!existsSync(absolute)) return new Map();
  const content = readFileSync(absolute, 'utf8');
  const values = new Map();
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z0-9_\.\-]+)\s*=\s*(.*)$/);
    if (!match) return;
    values.set(match[1], (match[2] ?? '').replace(/^['\"]|['\"]$/g, ''));
  });
  return values;
}

function pickEnv(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  for (const envFile of ENV_FILES) {
    const values = readEnvFileValues(envFile);
    for (const name of names) {
      if (values.has(name)) return values.get(name);
    }
  }
  return undefined;
}

function chunk(values, size = 180) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function tryReadJson(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

async function loadCurrentViewport() {
  try {
    const entries = await fs.readdir(CURRENT_ARTIFACT_ROOT, { withFileTypes: true });
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left));
    for (const dir of dirs) {
      const requestPath = path.join(CURRENT_ARTIFACT_ROOT, dir, 'climb', 'run-1', 'request.json');
      const payload = await tryReadJson(requestPath);
      if (!payload?.selectedRequest) continue;
      const selected = payload.selectedRequest;
      const browseRequest = Array.isArray(payload.allNearbyRequests)
        ? payload.allNearbyRequests.find((entry) => !entry.queryText)
        : null;
      return {
        artifactDir: path.relative(process.cwd(), path.join(CURRENT_ARTIFACT_ROOT, dir)),
        center: {
          lat: Number(selected.centerLat) || HANOI_CENTER.lat,
          lng: Number(selected.centerLng) || HANOI_CENTER.lng,
        },
        strictRadiusMeters: Number(selected.radiusMeters) || CURRENT_VIEWPORT_DEFAULT.strictRadiusMeters,
        browseRadiusMeters: Number(browseRequest?.radiusMeters) || CURRENT_VIEWPORT_DEFAULT.browseRadiusMeters,
      };
    }
  } catch {
    // ignore
  }
  return {
    artifactDir: null,
    ...CURRENT_VIEWPORT_DEFAULT,
  };
}

function computeWidenedRadiusMeters() {
  const corners = [
    HANOI_BBOX.sw,
    { lat: HANOI_BBOX.sw.lat, lng: HANOI_BBOX.ne.lng },
    { lat: HANOI_BBOX.ne.lat, lng: HANOI_BBOX.sw.lng },
    HANOI_BBOX.ne,
  ];
  const maxDistance = corners.reduce(
    (max, corner) => Math.max(max, haversineMeters(HANOI_CENTER.lat, HANOI_CENTER.lng, corner.lat, corner.lng)),
    0,
  );
  return Math.ceil((maxDistance + 500) / 500) * 500;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { rawText: text };
  }
  return { ok: response.ok, status: response.status, payload };
}

function buildNearbyUrl({ center, radiusMeters, queryText }) {
  const url = new URL('/api/nearby', BASE_URL);
  url.searchParams.set('lat', String(center.lat));
  url.searchParams.set('lng', String(center.lng));
  url.searchParams.set('radius', String(radiusMeters));
  url.searchParams.set('limit', '250');
  url.searchParams.set('debug', '1');
  url.searchParams.set('refresh', '1');
  if (queryText) url.searchParams.set('q', queryText);
  return url;
}

async function fetchSurface(key, { center, radiusMeters, queryText, viewportKind }) {
  const url = buildNearbyUrl({ center, radiusMeters, queryText });
  const result = await fetchJson(url);
  if (!result.ok) {
    throw new Error(`Surface ${key} failed (${result.status}): ${result.payload?.error ?? 'Unknown error'}`);
  }
  const debug = result.payload?.debug ?? {};
  const finalItems = Array.isArray(result.payload?.activities) ? result.payload.activities : [];
  const stageItems = debug.stageItems ?? {};
  return {
    key,
    viewportKind,
    queryText,
    center,
    radiusMeters,
    url: url.toString(),
    count: result.payload?.count ?? finalItems.length,
    requestMeta: debug.requestMeta ?? null,
    routeTimings: debug.routeTimings ?? null,
    candidateCounts: debug.candidateCounts ?? null,
    dropReasons: debug.dropReasons ?? null,
    stageItems,
    finalItems,
  };
}

async function loadPlaces(client) {
  const rows = [];
  const pageSize = 1000;
  for (let page = 0; page < 20; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from('places')
      .select('id,name,address,locality,region,country,lat,lng,categories,tags,primary_source,aggregated_from,source_confidence,website,rating,rating_count,popularity_score,metadata,updated_at,cached_at')
      .gte('lat', HANOI_BBOX.sw.lat)
      .lte('lat', HANOI_BBOX.ne.lat)
      .gte('lng', HANOI_BBOX.sw.lng)
      .lte('lng', HANOI_BBOX.ne.lng)
      .order('name', { ascending: true })
      .range(from, to);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows.map((row) => ({
    ...row,
    lat: Number(row.lat),
    lng: Number(row.lng),
    categories: Array.isArray(row.categories) ? row.categories : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    aggregated_from: Array.isArray(row.aggregated_from) ? row.aggregated_from : [],
  }));
}

async function loadVenueActivities(client, placeIds) {
  if (!placeIds.length) return new Map();
  const catalogMap = await loadActivityCatalog(client);
  const map = new Map();
  for (const ids of chunk(placeIds)) {
    const { data, error } = await client
      .from('venue_activities')
      .select('venue_id,activity_id,source,confidence,matched_at')
      .in('venue_id', ids);
    if (error) throw error;
    (data ?? []).forEach((row) => {
      const activity = catalogMap.get(row.activity_id);
      const bucket = map.get(row.venue_id) ?? [];
      bucket.push({
        activityId: row.activity_id,
        slug: activity?.slug ?? String(row.activity_id),
        name: activity?.name ?? String(row.activity_id),
        keywords: activity?.keywords ?? [],
        source: row.source,
        confidence: row.confidence == null ? null : Number(row.confidence),
        matchedAt: row.matched_at,
      });
      map.set(row.venue_id, bucket);
    });
  }
  return map;
}

async function loadActivityCatalog(client) {
  const { data, error } = await client
    .from('activity_catalog')
    .select('id,slug,name,keywords');
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, {
    slug: row.slug,
    name: row.name,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
  }]));
}

async function loadManualOverrides(client, placeIds) {
  if (!placeIds.length) return new Map();
  const catalogMap = await loadActivityCatalog(client);
  const map = new Map();
  for (const ids of chunk(placeIds)) {
    const { data, error } = await client
      .from('activity_manual_overrides')
      .select('venue_id,activity_id,reason')
      .in('venue_id', ids);
    if (error) throw error;
    (data ?? []).forEach((row) => {
      const activity = catalogMap.get(row.activity_id);
      const bucket = map.get(row.venue_id) ?? [];
      bucket.push({
        activityId: row.activity_id,
        slug: activity?.slug ?? String(row.activity_id),
        name: activity?.name ?? String(row.activity_id),
        reason: row.reason ?? null,
      });
      map.set(row.venue_id, bucket);
    });
  }
  return map;
}

async function loadPlaceSources(client, placeIds) {
  if (!placeIds.length) return new Map();
  const map = new Map();
  for (const ids of chunk(placeIds)) {
    const { data, error } = await client
      .from('place_sources')
      .select('place_id,provider,name,categories,confidence')
      .in('place_id', ids)
      .order('provider', { ascending: true });
    if (error) throw error;
    (data ?? []).forEach((row) => {
      const bucket = map.get(row.place_id) ?? [];
      bucket.push({
        provider: row.provider,
        name: row.name,
        categories: Array.isArray(row.categories) ? row.categories : [],
        confidence: row.confidence == null ? null : Number(row.confidence),
      });
      map.set(row.place_id, bucket);
    });
  }
  return map;
}

function buildVerificationState(mappedActivities, manualOverrides) {
  if (manualOverrides.length > 0) return 'verified';
  const maxConfidence = mappedActivities.reduce(
    (max, row) => (typeof row.confidence === 'number' && Number.isFinite(row.confidence) ? Math.max(max, row.confidence) : max),
    -1,
  );
  if (maxConfidence >= 0.72) return 'needs_votes';
  return 'suggested';
}

function buildFallbackMatches(place) {
  const inferredTypes = inferHeuristicActivityTypes(place, [], []);
  return inferredTypes.map((activityId) => ({
    activityId,
    score: activityId === 'bouldering' ? 0.9 : 0.88,
    eligible: true,
    evidence: [{ source: 'token_evidence', detail: 'name/categories/tags token match' }],
  }));
}

function buildFallbackVisibleTypes(place) {
  const haystack = uniqueNormalized([place.name, place.address, ...place.categories, ...place.tags]).join(' ');
  const inferredTypes = inferHeuristicActivityTypes(place, [], []);
  if (HOSPITALITY_PATTERN.test(haystack) && !containsClimbToken(haystack)) {
    return [];
  }
  return inferredTypes;
}

function buildStrictSearchEvidence(place, candidate) {
  const tags = unique([...(place.tags ?? []), ...candidate.providerCategories]);
  const taxonomyCategories = [];
  return {
    name: place.name ?? undefined,
    description: [place.address, place.name].filter(Boolean).join(' ') || undefined,
    categories: tags,
    tags,
    taxonomyCategories,
    verifiedActivities: candidate.verificationState === 'verified' ? candidate.activityTypes : null,
    mappedActivityIds: candidate.verificationState === 'needs_votes' ? candidate.activityTypes : null,
    aiActivities: null,
    sessionActivityIds: null,
    venueTypes: [place.name, place.address, ...tags].filter(Boolean),
  };
}

function evaluateSpecificIntent(place, candidate, activityId, token) {
  const evidenceInput = buildStrictSearchEvidence(place, candidate);
  const tags = uniqueNormalized([...(evidenceInput.tags ?? []), ...(evidenceInput.taxonomyCategories ?? [])]);
  const activityTypes = uniqueNormalized(candidate.activityTypes);
  const exactStructuredTagMatch = tags.some((value) => {
    const resolved = resolveCanonicalActivityId(value);
    return resolved === activityId || value === activityId;
  });
  const exactStructuredActivityMatch = candidateHasActivity(activityTypes, activityId);
  const haystack = uniqueNormalized([
    place.name,
    place.address,
    ...(place.tags ?? []),
    ...(place.categories ?? []),
    ...candidate.providerCategories,
  ]).join(' ');
  const tokenEvidence = containsClimbToken(haystack);
  const strongEvidence = candidate.hasManualOverride || candidate.hasVenueActivityMapping || exactStructuredActivityMatch || exactStructuredTagMatch || tokenEvidence;
  const visible = {
    visible: strongEvidence && !(HOSPITALITY_PATTERN.test(haystack) && !candidate.hasVenueActivityMapping && !candidate.hasManualOverride),
    reason: strongEvidence
      ? (candidate.hasManualOverride || candidate.hasVenueActivityMapping || exactStructuredActivityMatch ? 'manual_or_validated_evidence' : 'facility_supported')
      : 'below_browse_threshold',
  };
  const score = candidate.hasManualOverride
    ? 1
    : candidate.hasVenueActivityMapping
      ? 0.92
      : exactStructuredActivityMatch || exactStructuredTagMatch
        ? 0.88
        : tokenEvidence
          ? 0.72
          : 0;
  const evidenceSources = [
    candidate.hasManualOverride ? 'manual_override' : null,
    candidate.hasVenueActivityMapping ? 'venue_activity_mapping' : null,
    exactStructuredActivityMatch ? 'exact_activity_type' : null,
    exactStructuredTagMatch ? 'exact_structured_tag' : null,
    tokenEvidence ? 'token_evidence' : null,
  ].filter(Boolean);
  if (exactStructuredActivityMatch && candidate.verificationState === 'verified') {
    return {
      activityId,
      token,
      eligible: true,
      reason: 'exact_activity_type',
      visible: visible.visible,
      visibleReason: visible.reason,
      score,
      evidenceSources: ['exact_activity_type', ...evidenceSources],
    };
  }
  if (exactStructuredTagMatch) {
    return {
      activityId,
      token,
      eligible: true,
      reason: 'exact_structured_tag',
      visible: visible.visible,
      visibleReason: visible.reason,
      score,
      evidenceSources: ['exact_structured_tag', ...evidenceSources],
    };
  }
  return {
    activityId,
    token,
    eligible: strongEvidence,
    reason: strongEvidence ? 'heuristic_specific_intent' : 'below_specific_threshold',
    visible: visible.visible,
    visibleReason: visible.reason,
    score,
    evidenceSources,
  };
}

function buildCandidate(place, mappedActivities, manualOverrides, placeSources) {
  const activityTypes = unique([
    ...mappedActivities.map((row) => row.slug),
  ]);
  const structuredActivityTypes = unique(
    mappedActivities
      .filter((row) => row.source === 'manual' || row.source === 'category')
      .map((row) => row.slug),
  );
  const providerCategories = unique(placeSources.flatMap((row) => row.categories));
  const providerNames = unique(placeSources.map((row) => row.name));
  const fallbackMatches = buildFallbackMatches(place);
  const fallbackVisibleTypes = unique(buildFallbackVisibleTypes(place));
  const verificationState = buildVerificationState(mappedActivities, manualOverrides);
  const hasVenueActivityMapping = mappedActivities.some((row) => row.source === 'manual' || row.source === 'category');
  const hasManualOverride = manualOverrides.length > 0;
  const activityFirst = evaluateActivityFirstDiscoveryPolicy({
    name: place.name,
    description: place.address,
    categories: place.categories,
    tags: place.tags,
    activityTypes: structuredActivityTypes,
    taxonomyCategories: null,
    hasVenueActivityMapping,
    hasManualOverride,
  });
  const inferredCandidate = fallbackMatches.some((match) => ['climbing', 'bouldering'].includes(match.activityId));
  const tokenCandidate = [
    place.name,
    place.address,
    ...place.tags,
    ...place.categories,
    ...providerCategories,
    ...providerNames,
  ].some((value) => containsClimbToken(value));
  const mappedCandidate = mappedActivities.some((row) => row.slug === 'climbing' && (row.source === 'manual' || row.source === 'category'));
  const isCandidate = mappedCandidate || inferredCandidate || tokenCandidate || hasManualOverride;
  const candidateContext = {
    activityTypes: activityTypes.length ? activityTypes : fallbackVisibleTypes,
    providerCategories,
    verificationState,
    hasVenueActivityMapping,
    hasManualOverride,
  };
  const climbIntent = evaluateSpecificIntent(place, candidateContext, 'climbing', 'climb');
  const boulderingIntent = evaluateSpecificIntent(place, candidateContext, 'bouldering', 'bouldering');

  return {
    placeId: place.id,
    name: place.name,
    address: place.address,
    locality: place.locality,
    lat: place.lat,
    lng: place.lng,
    primarySource: place.primary_source ?? null,
    aggregatedFrom: place.aggregated_from,
    rawTags: place.tags,
    rawCategories: place.categories,
    providerCategories,
    providerNames,
    sourceConfidence: place.source_confidence == null ? null : Number(place.source_confidence),
    rating: place.rating == null ? null : Number(place.rating),
    ratingCount: place.rating_count == null ? null : Number(place.rating_count),
    popularityScore: place.popularity_score == null ? null : Number(place.popularity_score),
    website: place.website ?? null,
    mappedActivities: mappedActivities.map((row) => ({
      slug: row.slug,
      source: row.source,
      confidence: row.confidence,
      matchedAt: row.matchedAt,
    })),
    manualOverrides: manualOverrides.map((row) => ({ slug: row.slug, reason: row.reason })),
    activityTypes: activityTypes.length ? activityTypes : fallbackVisibleTypes,
    structuredActivityTypes,
    fallbackMatches: fallbackMatches.map((match) => ({
      activityId: match.activityId,
      score: round(match.score, 3),
      eligible: match.eligible,
      evidenceSources: match.evidence.map((entry) => entry.source),
      evidenceDetails: match.evidence.map((entry) => entry.detail),
    })),
    fallbackVisibleTypes,
    verificationState,
    hasVenueActivityMapping,
    hasManualOverride,
    activityFirstEligibility: activityFirst,
    strictIntent: {
      climb: climbIntent,
      bouldering: boulderingIntent,
    },
    isCandidate,
  };
}

function toStageIndex(items) {
  const byPlaceId = new Map();
  (items ?? []).forEach((item) => {
    const key = item.placeId ?? item.place_id ?? (typeof item.id === 'string' ? item.id.replace(/^place:/, '') : item.id);
    if (key) byPlaceId.set(key, item);
  });
  return byPlaceId;
}

function findLikelyDedupeWinner(candidate, afterDedupeItems) {
  const sameName = (afterDedupeItems ?? []).find((item) =>
    normalize(item.name) === normalize(candidate.name)
    && item.placeId !== candidate.placeId
    && haversineMeters(candidate.lat, candidate.lng, item.lat, item.lng) <= 60,
  );
  if (sameName) return { placeId: sameName.placeId ?? null, name: sameName.name };
  const nearby = (afterDedupeItems ?? []).find((item) =>
    haversineMeters(candidate.lat, candidate.lng, item.lat, item.lng) <= 32,
  );
  return nearby ? { placeId: nearby.placeId ?? null, name: nearby.name } : null;
}

function analyzeSurface(candidate, surface) {
  const afterFallbackMerge = toStageIndex(surface.stageItems?.afterFallbackMerge);
  const afterLaunchVisibility = toStageIndex(surface.stageItems?.afterLaunchVisibility);
  const afterMetadataFilter = toStageIndex(surface.stageItems?.afterMetadataFilter);
  const afterConfidenceGate = toStageIndex(surface.stageItems?.afterConfidenceGate);
  const afterDedupe = toStageIndex(surface.stageItems?.afterDedupe);
  const final = toStageIndex(surface.stageItems?.final ?? surface.finalItems);
  const inViewport = withinRadius(candidate, surface.center, surface.radiusMeters);
  const included = final.has(candidate.placeId);
  const inAfterFallback = afterFallbackMerge.has(candidate.placeId);
  const inAfterLaunch = afterLaunchVisibility.has(candidate.placeId);
  const inAfterMetadata = afterMetadataFilter.has(candidate.placeId);
  const inAfterConfidence = afterConfidenceGate.has(candidate.placeId);
  const inAfterDedupe = afterDedupe.has(candidate.placeId);
  const likelyWinner = !inAfterDedupe && inAfterConfidence
    ? findLikelyDedupeWinner(candidate, surface.stageItems?.afterDedupe ?? [])
    : null;

  let exactExclusionReason = 'included';
  if (!inViewport) {
    exactExclusionReason = 'outside_viewport';
  } else if (included) {
    exactExclusionReason = 'included';
  } else if (!inAfterFallback) {
    if (!candidate.activityFirstEligibility.isEligible) {
      exactExclusionReason = 'activity_first_contract_rejected';
    } else if (
      surface.queryText
      && candidate.verificationState === 'suggested'
      && !candidate.hasVenueActivityMapping
      && !candidate.hasManualOverride
    ) {
      exactExclusionReason = 'keyword_only_or_unstructured_candidate_not_returned';
    } else if (surface.queryText === 'climb' && !candidate.strictIntent.climb.eligible) {
      exactExclusionReason = `strict_search_rejected:${candidate.strictIntent.climb.reason}`;
    } else if (surface.queryText === 'climb' && !candidate.strictIntent.climb.visible) {
      exactExclusionReason = `launch_visible_rejected:${candidate.strictIntent.climb.visibleReason}`;
    } else if (surface.queryText === 'bouldering' && !candidate.strictIntent.bouldering.eligible) {
      exactExclusionReason = `strict_search_rejected:${candidate.strictIntent.bouldering.reason}`;
    } else if (surface.queryText === 'bouldering' && !candidate.strictIntent.bouldering.visible) {
      exactExclusionReason = `launch_visible_rejected:${candidate.strictIntent.bouldering.visibleReason}`;
    } else if (!surface.queryText && candidate.fallbackVisibleTypes.length === 0) {
      exactExclusionReason = 'browse_inference_produced_no_launch_visible_activity';
    } else {
      exactExclusionReason = 'not_present_before_launch_visibility';
    }
  } else if (!inAfterLaunch) {
    exactExclusionReason = 'blocked_by_launch_visible_rules';
  } else if (!inAfterMetadata) {
    exactExclusionReason = surface.queryText ? 'filtered_by_query_or_metadata' : 'filtered_by_metadata';
  } else if (!inAfterConfidence) {
    exactExclusionReason = 'below_confidence_gate';
  } else if (!inAfterDedupe) {
    exactExclusionReason = likelyWinner
      ? `deduped_away_to:${likelyWinner.name}`
      : 'deduped_away';
  } else {
    exactExclusionReason = 'trimmed_after_dedupe';
  }

  return {
    inViewport,
    included,
    beforeLaunchVisibility: inAfterFallback,
    afterLaunchVisibility: inAfterLaunch,
    afterMetadataFilter: inAfterMetadata,
    afterConfidenceGate: inAfterConfidence,
    afterDedupe: inAfterDedupe,
    removedByDedupe: inAfterConfidence && !inAfterDedupe,
    blockedByLaunchVisible: inAfterFallback && !inAfterLaunch,
    exactExclusionReason,
    likelyDedupeWinner: likelyWinner,
  };
}

function classifyDroppedByStage(candidate) {
  const widened = candidate.surfaceResults.widenedStrictClimb;
  if (!candidate.isCandidate) return 'missing';
  if (widened.included) return 'none';
  if (widened.exactExclusionReason === 'outside_viewport') return 'missing';
  if (widened.exactExclusionReason.includes('dedupe')) return 'dedupe';
  if (widened.blockedByLaunchVisible || widened.exactExclusionReason.includes('launch_visible')) return 'visibility';
  if (widened.exactExclusionReason.includes('confidence')) return 'confidence';
  if (widened.exactExclusionReason.includes('contract') || widened.exactExclusionReason.includes('keyword_only') || widened.exactExclusionReason.includes('strict_search_rejected')) return 'mapping';
  return 'missing';
}

function buildExactFixNeeded(candidate) {
  const widened = candidate.surfaceResults.widenedStrictClimb;
  if (widened.included) {
    if (candidate.placeId === '45b2cc2b-3e2d-4ab4-baec-e338306af813') {
      return 'Applied: manual overrides plus materialized `venue_activities` rows for `climbing` and `bouldering`.';
    }
    return 'None.';
  }
  if (candidate.name === 'Unnamed place') {
    return 'No code fix; requires real venue identity / source data before it should be visible.';
  }
  if (classifyDroppedByStage(candidate) === 'mapping') {
    return 'Add verified/manual climb-bouldering mapping or improve source data so the venue is no longer keyword-only.';
  }
  return 'Needs inventory investigation outside this code fix.';
}

function buildFinalVerdict(candidate) {
  const widened = candidate.surfaceResults.widenedStrictClimb;
  if (widened.included) {
    if (candidate.placeId === '45b2cc2b-3e2d-4ab4-baec-e338306af813') {
      return 'fixed-by-manual-mapping';
    }
    return 'visible-correctly';
  }
  if (candidate.name === 'Unnamed place') return 'remaining-inventory-gap';
  return 'not-visible';
}

function summarizeVerdict(candidates) {
  const relevant = candidates.filter((candidate) => candidate.isCandidate);
  const currentlyVisible = relevant.filter((candidate) => candidate.surfaceResults.currentStrictClimb.included);
  const widenedVisible = relevant.filter((candidate) => candidate.surfaceResults.widenedStrictClimb.included);
  const outsideCurrentButVisibleWidened = relevant.filter((candidate) =>
    !candidate.surfaceResults.currentStrictClimb.inViewport && candidate.surfaceResults.widenedStrictClimb.included,
  );
  const searchPathBugCandidates = relevant.filter((candidate) => {
    const strict = candidate.strictIntent.climb;
    const widened = candidate.surfaceResults.widenedStrictClimb;
    return widened.inViewport
      && !widened.included
      && (candidate.hasManualOverride || candidate.hasVenueActivityMapping || candidate.verificationState === 'verified' || candidate.verificationState === 'needs_votes')
      && strict.eligible
      && strict.visible
      && candidate.activityFirstEligibility.isEligible
      && widened.exactExclusionReason === 'not_present_before_launch_visibility';
  });
  const mappingGapCandidates = relevant.filter((candidate) => {
    const widened = candidate.surfaceResults.widenedStrictClimb;
    return widened.inViewport
      && !widened.included
      && !searchPathBugCandidates.some((entry) => entry.placeId === candidate.placeId);
  });
  let verdict = 'inventory/mapping gap';
  if (searchPathBugCandidates.length > 0) {
    verdict = 'search-path bug';
  } else if (mappingGapCandidates.length > 0 && outsideCurrentButVisibleWidened.length > 0) {
    verdict = 'mixed causes';
  } else if (outsideCurrentButVisibleWidened.length > 0 && mappingGapCandidates.length === 0) {
    verdict = 'viewport-only issue';
  }
  return {
    verdict,
    candidateCount: relevant.length,
    visibleCurrentStrictClimb: currentlyVisible.map((candidate) => candidate.name),
    visibleWidenedStrictClimb: widenedVisible.map((candidate) => candidate.name),
    outsideCurrentButVisibleWidened: outsideCurrentButVisibleWidened.map((candidate) => candidate.name),
    searchPathBugCandidates: searchPathBugCandidates.map((candidate) => candidate.name),
    mappingGapCandidates: mappingGapCandidates.map((candidate) => candidate.name),
  };
}

function buildExpectedKnownReconciliation(candidates) {
  const rows = candidates
    .filter((candidate) => candidate.isCandidate)
    .map((candidate) => ({
      placeId: candidate.placeId,
      name: candidate.name,
      dbPresent: true,
      mappedToClimbing: candidate.mappedActivities.some((entry) => entry.slug === 'climbing'),
      manualOverride: candidate.hasManualOverride,
      tokenEvidence: [candidate.name, ...candidate.rawTags, ...candidate.rawCategories, ...candidate.providerCategories].some((value) => containsClimbToken(value)),
      currentStrictClimb: candidate.surfaceResults.currentStrictClimb.included,
      widenedStrictClimb: candidate.surfaceResults.widenedStrictClimb.included,
      currentBrowse: candidate.surfaceResults.currentBrowse.included,
      widenedBrowse: candidate.surfaceResults.widenedBrowse.included,
      exclusion: candidate.surfaceResults.widenedStrictClimb.exactExclusionReason,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return {
    source: 'db-derived Hanoi climbing candidate inventory',
    rows,
  };
}

function buildMarkdown({ generatedAt, baseUrl, currentViewport, widenedRadiusMeters, surfaces, candidates, verdict, expectedKnown }) {
  const lines = [];
  lines.push('# Hanoi climbing completeness audit');
  lines.push('');
  lines.push(`- Generated at: ${generatedAt}`);
  lines.push(`- Base URL: ${baseUrl}`);
  lines.push(`- Current strict viewport: center ${currentViewport.center.lat}, ${currentViewport.center.lng}; radius ${currentViewport.strictRadiusMeters}m`);
  lines.push(`- Current browse viewport: center ${currentViewport.center.lat}, ${currentViewport.center.lng}; radius ${currentViewport.browseRadiusMeters}m`);
  lines.push(`- Widened Hanoi viewport radius: ${widenedRadiusMeters}m`);
  if (currentViewport.artifactDir) lines.push(`- Current viewport source artifact: ${currentViewport.artifactDir}`);
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(`- Verdict: ${verdict.verdict}`);
  lines.push(`- Current strict climb visible: ${verdict.visibleCurrentStrictClimb.join(', ') || 'none'}`);
  lines.push(`- Widened strict climb visible: ${verdict.visibleWidenedStrictClimb.join(', ') || 'none'}`);
  lines.push(`- Search-path bug candidates: ${verdict.searchPathBugCandidates.join(', ') || 'none'}`);
  lines.push(`- Inventory/mapping-gap candidates: ${verdict.mappingGapCandidates.join(', ') || 'none'}`);
  lines.push('');
  lines.push('## Surfaces');
  lines.push('');
  lines.push('| Surface | Query | Radius m | Count | URL |');
  lines.push('| --- | --- | ---: | ---: | --- |');
  surfaces.forEach((surface) => {
    lines.push(`| ${escapeMarkdown(surface.key)} | ${escapeMarkdown(surface.queryText || '(browse)')} | ${surface.radiusMeters} | ${surface.count} | ${escapeMarkdown(surface.url)} |`);
  });
  lines.push('');
  lines.push('## Candidate table');
  lines.push('');
  lines.push('| Name | Persisted in DB | Matched row ids | Mapped to climb/bouldering | Evidence sources present | Confidence / gate values | Dropped by stage | Final verdict | Exact fix needed |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  candidates
    .filter((candidate) => candidate.isCandidate)
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((candidate) => {
      const evidenceSources = unique([
        ...candidate.fallbackMatches.flatMap((entry) => entry.evidenceSources ?? []),
        ...candidate.mappedActivities.map((entry) => `${entry.slug}:${entry.source}`),
        ...candidate.manualOverrides.map((entry) => `${entry.slug}:manual-override`),
      ]).join(', ') || 'none';
      const confidenceValues = [
        `verification=${candidate.verificationState}`,
        `sourceConfidence=${candidate.sourceConfidence ?? 'null'}`,
        `strictVisible=${candidate.surfaceResults.widenedStrictClimb.included ? 'yes' : 'no'}`,
        `exclusion=${candidate.surfaceResults.widenedStrictClimb.exactExclusionReason}`,
      ].join('; ');
      lines.push(`| ${escapeMarkdown(candidate.name)} | yes | ${escapeMarkdown(candidate.placeId)} | ${candidate.mappedActivities.some((entry) => ['climbing', 'bouldering'].includes(entry.slug)) ? 'yes' : 'no'} | ${escapeMarkdown(evidenceSources)} | ${escapeMarkdown(confidenceValues)} | ${escapeMarkdown(classifyDroppedByStage(candidate))} | ${escapeMarkdown(buildFinalVerdict(candidate))} | ${escapeMarkdown(buildExactFixNeeded(candidate))} |`);
    });
  lines.push('');
  lines.push('## Expected-known reconciliation');
  lines.push('');
  lines.push(`- Source: ${expectedKnown.source}`);
  lines.push('| Name | DB present | Mapped | Manual | Current strict climb | Widened strict climb | Exclusion |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  expectedKnown.rows.forEach((row) => {
    lines.push(`| ${escapeMarkdown(row.name)} | ${row.dbPresent ? 'yes' : 'no'} | ${row.mappedToClimbing ? 'yes' : 'no'} | ${row.manualOverride ? 'yes' : 'no'} | ${row.currentStrictClimb ? 'yes' : 'no'} | ${row.widenedStrictClimb ? 'yes' : 'no'} | ${escapeMarkdown(row.exclusion)} |`);
  });
  return `${lines.join('\n')}\n`;
}

async function main() {
  await ensureOutputDir();
  const currentViewport = await loadCurrentViewport();
  const widenedRadiusMeters = computeWidenedRadiusMeters();
  const surfaces = [
    await fetchSurface('currentStrictClimb', {
      center: currentViewport.center,
      radiusMeters: currentViewport.strictRadiusMeters,
      queryText: 'climb',
      viewportKind: 'current',
    }),
    await fetchSurface('currentStrictBouldering', {
      center: currentViewport.center,
      radiusMeters: currentViewport.strictRadiusMeters,
      queryText: 'bouldering',
      viewportKind: 'current',
    }),
    await fetchSurface('currentBrowse', {
      center: currentViewport.center,
      radiusMeters: currentViewport.browseRadiusMeters,
      queryText: '',
      viewportKind: 'current',
    }),
    await fetchSurface('widenedStrictClimb', {
      center: HANOI_CENTER,
      radiusMeters: widenedRadiusMeters,
      queryText: 'climb',
      viewportKind: 'widened',
    }),
    await fetchSurface('widenedStrictBouldering', {
      center: HANOI_CENTER,
      radiusMeters: widenedRadiusMeters,
      queryText: 'bouldering',
      viewportKind: 'widened',
    }),
    await fetchSurface('widenedBrowse', {
      center: HANOI_CENTER,
      radiusMeters: widenedRadiusMeters,
      queryText: '',
      viewportKind: 'widened',
    }),
  ];

  const supabaseUrl = pickEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL');
  const serviceKey = pickEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY');
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY');
  }
  const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const places = await loadPlaces(client);
  const placeIds = places.map((place) => place.id);
  const [venueActivitiesByPlaceId, manualOverridesByPlaceId, placeSourcesByPlaceId] = await Promise.all([
    loadVenueActivities(client, placeIds),
    loadManualOverrides(client, placeIds),
    loadPlaceSources(client, placeIds),
  ]);

  const candidates = places
    .map((place) => buildCandidate(
      place,
      venueActivitiesByPlaceId.get(place.id) ?? [],
      manualOverridesByPlaceId.get(place.id) ?? [],
      placeSourcesByPlaceId.get(place.id) ?? [],
    ))
    .filter((candidate) => candidate.isCandidate)
    .map((candidate) => ({
      ...candidate,
      surfaceResults: Object.fromEntries(
        surfaces.map((surface) => [surface.key, analyzeSurface(candidate, surface)]),
      ),
    }))
    .map((candidate) => ({
      ...candidate,
      persistedInDb: true,
      matchedRowIds: [candidate.placeId],
      mappedToClimbOrBouldering: candidate.mappedActivities.some((entry) => ['climbing', 'bouldering'].includes(entry.slug)),
      evidenceSourcesPresent: unique([
        ...candidate.fallbackMatches.flatMap((entry) => entry.evidenceSources ?? []),
        ...candidate.mappedActivities.map((entry) => `${entry.slug}:${entry.source}`),
        ...candidate.manualOverrides.map((entry) => `${entry.slug}:manual-override`),
      ]),
      confidenceGateValues: {
        verificationState: candidate.verificationState,
        sourceConfidence: candidate.sourceConfidence ?? null,
        widenedStrictClimbExclusion: candidate.surfaceResults.widenedStrictClimb.exactExclusionReason,
      },
      droppedByStage: classifyDroppedByStage(candidate),
      finalVerdict: buildFinalVerdict(candidate),
      exactFixNeeded: buildExactFixNeeded(candidate),
    }));

  const verdict = summarizeVerdict(candidates);
  const expectedKnown = buildExpectedKnownReconciliation(candidates);
  const summary = {
    generatedAt: new Date().toISOString(),
    city: 'hanoi',
    baseUrl: BASE_URL,
    currentViewport,
    widenedRadiusMeters,
    bbox: HANOI_BBOX,
    verdict,
    surfaceSummaries: surfaces.map((surface) => ({
      key: surface.key,
      viewportKind: surface.viewportKind,
      queryText: surface.queryText,
      center: surface.center,
      radiusMeters: surface.radiusMeters,
      count: surface.count,
      url: surface.url,
      requestMeta: surface.requestMeta,
      candidateCounts: surface.candidateCounts,
      dropReasons: surface.dropReasons,
    })),
    expectedKnown,
  };

  await fs.writeFile(path.join(OUTPUT_DIR, 'summary.json'), `${toJson(summary)}\n`);
  await fs.writeFile(path.join(OUTPUT_DIR, 'candidate-table.json'), `${toJson(candidates)}\n`);
  await fs.writeFile(path.join(OUTPUT_DIR, 'surface-debug.json'), `${toJson(surfaces)}\n`);
  await fs.writeFile(path.join(OUTPUT_DIR, 'candidate-table.md'), buildMarkdown({
    generatedAt: summary.generatedAt,
    baseUrl: BASE_URL,
    currentViewport,
    widenedRadiusMeters,
    surfaces,
    candidates,
    verdict,
    expectedKnown,
  }));

  console.log(toJson({ outputDir: path.relative(process.cwd(), OUTPUT_DIR), verdict }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
