#!/usr/bin/env node

import process from 'node:process';
import { writeFileSync } from 'node:fs';

const DEFAULT_BASE_URL = 'http://localhost:3002';
const HANOI_CENTER = { lat: 21.0285, lng: 105.8542 };
const DEFAULT_RADIUS_METERS = 5000;
const DEFAULT_LIMIT = 14;
const MAP_SEARCH_AUGMENT_LIMIT = 240;
const QUERY_LIST = [
  'climbing',
  'bouldering',
  'yoga',
  'running',
  'badminton',
  'tennis',
  'football',
  'basketball',
  'swimming',
  'boxing',
  'martial arts',
  'dance',
  'chess',
  'pottery',
];

const HOSPITALITY_PATTERN = /\b(cafe|coffee|restaurant|bar|pub|lounge|cocktail|beer|nightlife|club|rooftop|mall|retail|shop|spa|massage)\b/i;
const GENERIC_PARK_PATTERN = /\b(park|garden|green space|plaza)\b/i;
const GENERIC_COMMUNITY_PATTERN = /\b(community|cultural|house|centre|center|hall)\b/i;
const UNNAMED_PATTERN = /^(unnamed place|nearby (spot|activity|venue)|[a-z]+ spot)$/i;
const WEAK_ACTIVITY_PATTERN = /\b(activity|fitness|sport|sports)\b/i;
const PARK_COMPATIBLE_QUERIES = new Set(['running']);

const pickArg = (name, fallback = undefined) => {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length).trim() : fallback;
};

const baseUrl = pickArg('baseUrl', process.env.HANOI_AUDIT_BASE_URL ?? DEFAULT_BASE_URL);
const output = pickArg('output');
const radiusMeters = Number.parseInt(pickArg('radius', String(DEFAULT_RADIUS_METERS)), 10);
const limit = Number.parseInt(pickArg('limit', String(DEFAULT_LIMIT)), 10);

const normalize = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
const normalizeArray = (values) => (Array.isArray(values) ? values.map((value) => normalize(value)).filter(Boolean) : []);

const hasStrongEvidence = (item, query) => {
  const normalizedQuery = normalize(query);
  const typeMatch = normalizeArray(item.activity_types).some((value) => value === normalizedQuery || value.includes(normalizedQuery) || normalizedQuery.includes(value));
  const tagMatch = normalizeArray(item.tags).some((value) => value === normalizedQuery || value.includes(normalizedQuery) || normalizedQuery.includes(value));
  const taxonomyMatch = normalizeArray(item.taxonomy_categories).some((value) => value === normalizedQuery || value.includes(normalizedQuery) || normalizedQuery.includes(value));
  const sessionBacked = (item.upcoming_session_count ?? 0) > 0 || Boolean(item.starts_at);
  const verified = item.verificationState === 'verified' || item.verification_state === 'verified' || item.verified === true;
  const categoryMatch = item.categoryMatch === true;
  return typeMatch || tagMatch || taxonomyMatch || sessionBacked || verified || categoryMatch;
};

const inferAdmissionReason = (item, query, surface) => {
  const reasons = [];
  const typeTokens = normalizeArray(item.activity_types);
  const tags = normalizeArray(item.tags);
  const taxonomy = normalizeArray(item.taxonomy_categories);
  const categories = normalizeArray(item.primaryCategories);
  const name = normalize(item.name ?? item.venueName);
  if (typeTokens.length) reasons.push(`activity_types=${typeTokens.slice(0, 3).join(',')}`);
  if (tags.length) reasons.push(`tags=${tags.slice(0, 3).join(',')}`);
  if (taxonomy.length) reasons.push(`taxonomy=${taxonomy.slice(0, 2).join(',')}`);
  if (categories.length) reasons.push(`categories=${categories.slice(0, 3).join(',')}`);
  if ((item.upcoming_session_count ?? 0) > 0) reasons.push(`sessions=${item.upcoming_session_count}`);
  if (item.verificationState || item.verification_state) reasons.push(`verification=${item.verificationState ?? item.verification_state}`);
  if (item.categoryMatch) reasons.push('category-match');
  if (item.keywordMatch) reasons.push('keyword-match');
  if (name.includes(normalize(query))) reasons.push('name-match');
  if (!reasons.length) reasons.push(`surface=${surface}`);
  return reasons.join('; ');
};

const classifyVisibleResult = (query, item) => {
  const normalizedQuery = normalize(query);
  const name = normalize(item.name ?? item.venueName);
  const placeLabel = normalize(item.place_label ?? item.displayAddress);
  const combined = `${name} ${placeLabel} ${normalizeArray(item.tags).join(' ')} ${normalizeArray(item.taxonomy_categories).join(' ')} ${normalizeArray(item.primaryCategories).join(' ')}`.trim();
  const strongEvidence = hasStrongEvidence(item, query);
  const hospitality = HOSPITALITY_PATTERN.test(combined);
  const genericPark = GENERIC_PARK_PATTERN.test(combined);
  const genericCommunity = GENERIC_COMMUNITY_PATTERN.test(combined);
  const unnamed = UNNAMED_PATTERN.test(name) || UNNAMED_PATTERN.test(placeLabel) || !name;
  const weakBroadActivity = WEAK_ACTIVITY_PATTERN.test(combined) && !strongEvidence;
  const textualMatch = combined.includes(normalizedQuery);

  if (unnamed) {
    return { verdict: 'false_positive', action: 'suppress', reason: 'unnamed/generic location' };
  }
  if (hospitality && !strongEvidence) {
    return { verdict: 'false_positive', action: 'suppress', reason: 'hospitality-first without counter-evidence' };
  }
  if ((genericCommunity || genericPark) && !strongEvidence) {
    if (genericPark && PARK_COMPATIBLE_QUERIES.has(normalizedQuery)) {
      return { verdict: 'weak_positive', action: 'demote', reason: 'park-compatible query but weak facility evidence' };
    }
    return { verdict: 'false_positive', action: 'suppress', reason: genericCommunity ? 'generic community/cultural venue' : 'generic park without facility evidence' };
  }
  if (weakBroadActivity) {
    return { verdict: 'false_positive', action: 'suppress', reason: 'broad activity label without true facility evidence' };
  }
  if (strongEvidence) {
    return { verdict: 'true_positive', action: 'preserve', reason: 'strong activity evidence' };
  }
  if (textualMatch) {
    return { verdict: 'weak_positive', action: 'demote', reason: 'textual match but limited structured evidence' };
  }
  return { verdict: 'false_positive', action: 'suppress', reason: 'no convincing activity evidence' };
};

const summarizeVisibleItem = (query, item, surface) => {
  const classification = classifyVisibleResult(query, item);
  return {
    id: item.id ?? item.venueId ?? null,
    name: item.name ?? item.venueName ?? null,
    placeLabel: item.place_label ?? item.displayAddress ?? item.venueName ?? null,
    source: item.source ?? surface,
    activityTypes: item.activity_types ?? [item.activity].filter(Boolean),
    tags: item.tags ?? item.primaryCategories ?? [],
    taxonomyCategories: item.taxonomy_categories ?? [],
    verification: item.verification_state ?? item.verificationState ?? null,
    score: item.score ?? item.rank_score ?? item.trustScore ?? null,
    whyIncluded: inferAdmissionReason(item, query, surface),
    evidenceSource: inferAdmissionReason(item, query, surface),
    ...classification,
  };
};

const fetchJson = async (path) => {
  const response = await fetch(new URL(path, baseUrl));
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { rawText: text };
    }
  }
  return { status: response.status, ok: response.ok, payload };
};

const buildSearchPath = (pathname, query) => {
  const url = new URL(pathname, baseUrl);
  url.searchParams.set('lat', String(HANOI_CENTER.lat));
  url.searchParams.set('lng', String(HANOI_CENTER.lng));
  url.searchParams.set('radius', String(radiusMeters));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('debug', '1');
  url.searchParams.set('refresh', '1');
  url.searchParams.set('q', query);
  return `${url.pathname}?${url.searchParams.toString()}`;
};

const summarizeSurfaceResults = (query, surface, payload, itemKey) => {
  const items = payload?.[itemKey] ?? [];
  return items.slice(0, limit).map((item) => summarizeVisibleItem(query, item, surface));
};

const auditQuery = async (query) => {
  const nearby = await fetchJson(buildSearchPath('/api/nearby', query));
  const discovery = await fetchJson(buildSearchPath('/api/discovery/activities', query));
  const searchVenues = await fetchJson(
    `/api/search-venues?activity=${encodeURIComponent(query)}&lat=${HANOI_CENTER.lat}&lng=${HANOI_CENTER.lng}&radius=${radiusMeters}&limit=${limit}&includeUnverified=1`,
  );
  const mapResults = nearby.ok ? summarizeSurfaceResults(query, 'map', nearby.payload, 'activities') : [];
  const nearbyResults = nearby.ok ? summarizeSurfaceResults(query, 'nearby', nearby.payload, 'activities') : [];
  const discoveryResults = discovery.ok ? summarizeSurfaceResults(query, 'discovery', discovery.payload, 'items') : [];
  const searchVenueResults = searchVenues.ok
    ? (searchVenues.payload?.results ?? []).slice(0, limit).map((item) => summarizeVisibleItem(query, item, 'search-venues'))
    : [];

  return {
    query,
    searchVenues: searchVenues.ok
      ? {
          status: searchVenues.status,
          activity: searchVenues.payload?.activity ?? null,
          topVisibleResults: searchVenueResults,
        }
      : {
          status: searchVenues.status,
          error: searchVenues.payload?.error ?? 'Unknown error',
          topVisibleResults: [],
        },
    map: {
      status: nearby.status,
      count: nearby.payload?.count ?? mapResults.length,
      error: nearby.ok ? null : nearby.payload?.error ?? 'Unknown error',
      topVisibleResults: mapResults,
    },
    nearby: {
      status: nearby.status,
      count: nearby.payload?.count ?? nearbyResults.length,
      error: nearby.ok ? null : nearby.payload?.error ?? 'Unknown error',
      topVisibleResults: nearbyResults,
    },
    discovery: {
      status: discovery.status,
      count: discovery.payload?.count ?? discoveryResults.length,
      error: discovery.ok ? null : discovery.payload?.error ?? 'Unknown error',
      topVisibleResults: discoveryResults,
    },
  };
};

const buildGlobalFindings = (audits) => {
  const findings = [];
  for (const audit of audits) {
    for (const surfaceKey of ['map', 'nearby', 'discovery', 'searchVenues']) {
      const surface = audit[surfaceKey];
      const results = surface?.topVisibleResults ?? [];
      for (const result of results) {
        if (result.action === 'suppress' || result.action === 'demote') {
          findings.push({ query: audit.query, surface: surfaceKey, name: result.name, reason: result.reason, action: result.action });
        }
      }
    }
  }
  return findings;
};

const run = async () => {
  const mapPage = await fetchJson('/map');
  const nearby = await fetchJson(`/api/nearby?lat=${HANOI_CENTER.lat}&lng=${HANOI_CENTER.lng}&radius=${radiusMeters}&limit=${MAP_SEARCH_AUGMENT_LIMIT}&debug=1&refresh=1`);
  const discovery = await fetchJson(`/api/discovery/activities?lat=${HANOI_CENTER.lat}&lng=${HANOI_CENTER.lng}&radius=${radiusMeters}&limit=${MAP_SEARCH_AUGMENT_LIMIT}&debug=1&refresh=1`);

  if (!nearby.ok) throw new Error(`Nearby request failed: ${nearby.status} ${nearby.payload?.error ?? ''}`.trim());
  if (!discovery.ok) throw new Error(`Discovery request failed: ${discovery.status} ${discovery.payload?.error ?? ''}`.trim());

  const audits = [];
  for (const query of QUERY_LIST) {
    audits.push(await auditQuery(query));
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    city: 'hanoi',
    baseUrl,
    center: HANOI_CENTER,
    radiusMeters,
    mapPage: { status: mapPage.status, ok: mapPage.ok },
    browseSurfaces: {
      nearby: {
        status: nearby.status,
        count: nearby.payload?.count ?? 0,
        source: nearby.payload?.source ?? null,
        cache: nearby.payload?.cache ?? null,
        debug: nearby.payload?.debug ?? null,
      },
      discovery: {
        status: discovery.status,
        count: discovery.payload?.count ?? 0,
        source: discovery.payload?.source ?? null,
        cache: discovery.payload?.cache ?? null,
        debug: discovery.payload?.debug ?? null,
      },
    },
    audits,
    findings: buildGlobalFindings(audits),
  };

  const text = JSON.stringify(payload, null, 2);
  if (output) writeFileSync(output, `${text}\n`);
  console.log(text);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});