#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

import { LAUNCH_CITY_CONFIG } from './utils/launch-city-config.mjs';
import loadEnv from './utils/load-env.mjs';

loadEnv(['.env.local', 'apps/doWhat-web/.env.local', 'apps/doWhat-mobile/.env.local']);

const { Pool } = pg;

export const TARGET_CITY_STANDARDS = {
  hanoi: {
    slug: 'hanoi',
    label: 'Hanoi',
    aliases: ['hanoi', 'hanoi, vietnam'],
    requiredActivities: {
      climbing: { minimum: 2, label: 'Climbing' },
      bouldering: { minimum: 1, label: 'Bouldering' },
      yoga: { minimum: 2, label: 'Yoga' },
      running: { minimum: 2, label: 'Running' },
    },
    reviewActivities: {
      chess: { minimum: 1, label: 'Chess' },
    },
  },
  bangkok: {
    slug: 'bangkok',
    label: 'Bangkok',
    aliases: ['bangkok', 'bangkok, thailand'],
    requiredActivities: {
      climbing: { minimum: 3, label: 'Climbing' },
      bouldering: { minimum: 2, label: 'Bouldering' },
      yoga: { minimum: 2, label: 'Yoga' },
      running: { minimum: 2, label: 'Running' },
      padel: { minimum: 2, label: 'Padel' },
    },
    reviewActivities: {
      chess: { minimum: 1, label: 'Chess' },
    },
  },
  danang: {
    slug: 'danang',
    label: 'Da Nang',
    aliases: ['danang', 'danang, vietnam', 'danang city', 'danangcity', 'da nang', 'da nang, vietnam'],
    requiredActivities: {
      climbing: { minimum: 1, label: 'Climbing' },
      bouldering: { minimum: 1, label: 'Bouldering' },
      yoga: { minimum: 1, label: 'Yoga' },
      running: { minimum: 1, label: 'Running' },
      padel: { minimum: 1, label: 'Padel' },
    },
    reviewActivities: {
      chess: { minimum: 1, label: 'Chess' },
    },
  },
};

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
] ;

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

const SAMPLE_LIMIT_DEFAULT = 8;
const SESSION_EVIDENCE_WINDOW_DAYS_DEFAULT = 365;
const STALE_MAPPING_DAYS_DEFAULT = 120;
const DUPLICATE_DISTANCE_METERS = 120;

const STATUS_ORDER = {
  acceptable: 0,
  suspicious: 1,
  failing: 2,
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

const normalizeComparable = (value) => normalizeToken(value).replace(/_/g, '');

const uniq = (values) => Array.from(new Set(values.filter(Boolean)));

const toIsoDate = (value) => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
};

const coerceNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const haversineMeters = (left, right) => {
  const lat1 = (left.lat * Math.PI) / 180;
  const lat2 = (right.lat * Math.PI) / 180;
  const dLat = ((right.lat - left.lat) * Math.PI) / 180;
  const dLng = ((right.lng - left.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const tokenIncludesStem = (token, stems) =>
  stems.some((stem) => token === stem || token.startsWith(`${stem}_`) || token.endsWith(`_${stem}`));

const gradeUpperBound = (value, acceptableMax, suspiciousMax) => {
  if (value <= acceptableMax) return 'acceptable';
  if (value <= suspiciousMax) return 'suspicious';
  return 'failing';
};

const gradeRatio = (value, acceptableMax, suspiciousMax) => {
  if (value <= acceptableMax) return 'acceptable';
  if (value <= suspiciousMax) return 'suspicious';
  return 'failing';
};

const gradeCoverage = ({ count, minimum, reviewOnly = false }) => {
  if (count >= minimum) return 'acceptable';
  if (reviewOnly) return 'suspicious';
  if (count >= Math.max(1, minimum - 1)) return 'suspicious';
  return 'failing';
};

const combineStatus = (...statuses) =>
  statuses.reduce((current, next) => (STATUS_ORDER[next] > STATUS_ORDER[current] ? next : current), 'acceptable');

const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;

const toSample = (place, extra = {}) => ({
  placeId: place.id,
  name: place.name,
  city: place.city ?? place.locality ?? null,
  categories: place.categories,
  tags: place.tags,
  mappedActivities: uniq(place.mappings.map((mapping) => mapping.slug)).sort(),
  manualActivities: uniq(place.manualOverrides.map((override) => override.slug)).sort(),
  sessionEvidenceActivities: uniq(place.sessionEvidenceSlugs).sort(),
  ...extra,
});

const inferActivitySlugsFromText = (...values) => {
  const text = normalizeToken(values.filter(Boolean).join(' '));
  if (!text) return [];
  return Object.entries(ACTIVITY_HINTS)
    .filter(([, hints]) => hints.some((hint) => text.includes(normalizeToken(hint).replace(/_/g, ' '))))
    .map(([slug]) => slug);
};

const evaluatePlaceBoundary = (place) => {
  const tokens = uniq([
    ...(place.categories ?? []),
    ...(place.tags ?? []),
    ...((place.providerCategories ?? []).flatMap((value) => value ?? [])),
  ].map(normalizeToken));

  const hasHospitalitySignals = tokens.some((token) => tokenIncludesStem(token, HOSPITALITY_STEMS));
  const hasActivityCategoryEvidence = tokens.some((token) => tokenIncludesStem(token, ACTIVITY_STEMS));

  return {
    hasHospitalitySignals,
    hasActivityCategoryEvidence,
    isHospitalityPrimary: hasHospitalitySignals && !hasActivityCategoryEvidence,
  };
};

const buildDuplicateClusters = (places) => {
  const buckets = new Map();

  places.forEach((place) => {
    const key = normalizeComparable(place.name);
    if (!key) return;
    const bucket = buckets.get(key) ?? [];
    bucket.push(place);
    buckets.set(key, bucket);
  });

  const clusters = [];

  buckets.forEach((bucket, normalizedName) => {
    if (bucket.length < 2) return;
    const visited = new Set();
    bucket.forEach((place) => {
      if (visited.has(place.id)) return;
      const cluster = [place];
      visited.add(place.id);
      bucket.forEach((candidate) => {
        if (visited.has(candidate.id)) return;
        const distanceMeters = haversineMeters(place, candidate);
        if (distanceMeters <= DUPLICATE_DISTANCE_METERS) {
          cluster.push(candidate);
          visited.add(candidate.id);
        }
      });
      if (cluster.length > 1) {
        clusters.push({
          normalizedName,
          size: cluster.length,
          placeIds: cluster.map((entry) => entry.id),
          names: uniq(cluster.map((entry) => entry.name)),
          samples: cluster.map((entry) => ({
            placeId: entry.id,
            name: entry.name,
            lat: entry.lat,
            lng: entry.lng,
            mappedActivities: uniq(entry.mappings.map((mapping) => mapping.slug)).sort(),
          })),
        });
      }
    });
  });

  clusters.sort((left, right) => right.size - left.size || left.normalizedName.localeCompare(right.normalizedName));
  return clusters;
};

const buildCoverageReport = (standard, places, sampleLimit) => {
  const coverage = {};

  const register = (slug, config, reviewOnly) => {
    const coveredPlaces = places.filter((place) => place.coveredActivitySlugs.has(slug));
    const sessionGapPlaces = places.filter(
      (place) => place.sessionEvidenceSlugs.includes(slug) && !place.mappedActivitySlugs.has(slug),
    );
    const manualOverridePlaces = places.filter((place) =>
      place.manualOverrides.some((override) => override.slug === slug),
    );
    const sourceBreakdown = {
      manual: coveredPlaces.filter((place) => place.mappings.some((mapping) => mapping.slug === slug && mapping.source === 'manual')).length,
      category: coveredPlaces.filter((place) => place.mappings.some((mapping) => mapping.slug === slug && mapping.source === 'category')).length,
      keyword: coveredPlaces.filter((place) => place.mappings.some((mapping) => mapping.slug === slug && mapping.source === 'keyword')).length,
      sessionEvidenceOnly: coveredPlaces.filter((place) => !place.mappedActivitySlugs.has(slug) && place.sessionEvidenceSlugs.includes(slug)).length,
    };

    const count = coveredPlaces.length;
    const status = gradeCoverage({ count, minimum: config.minimum, reviewOnly });
    coverage[slug] = {
      label: config.label,
      minimum: config.minimum,
      reviewOnly,
      count,
      status,
      manualOverridePlaces: manualOverridePlaces.length,
      sessionMappingGapPlaces: sessionGapPlaces.length,
      sourceBreakdown,
      samplePlaces: coveredPlaces.slice(0, sampleLimit).map((place) => ({
        placeId: place.id,
        name: place.name,
      })),
    };
  };

  Object.entries(standard.requiredActivities).forEach(([slug, config]) => register(slug, config, false));
  Object.entries(standard.reviewActivities).forEach(([slug, config]) => register(slug, config, true));
  return coverage;
};

export const buildCityInventoryReport = ({
  city,
  places,
  sampleLimit = SAMPLE_LIMIT_DEFAULT,
  staleMappingDays = STALE_MAPPING_DAYS_DEFAULT,
}) => {
  const standard = TARGET_CITY_STANDARDS[city];
  if (!standard) {
    throw new Error(`Unsupported city '${city}'.`);
  }

  const staleBefore = Date.now() - staleMappingDays * 24 * 60 * 60 * 1000;
  const duplicateClusters = buildDuplicateClusters(places);

  const hospitalityLeakSamples = [];
  const weakMappingSamples = [];
  const staleMappingSamples = [];
  const providerDisagreementSamples = [];
  const sessionMappingGapSamples = [];
  const manualOverrideSamples = [];

  const preparedPlaces = places.map((place) => {
    const boundary = evaluatePlaceBoundary(place);
    const manualOverrideSlugs = uniq(place.manualOverrides.map((override) => override.slug));
    const sessionEvidenceSlugs = uniq(place.sessionEvidenceSlugs);
    const mappedActivitySlugs = new Set(place.mappings.map((mapping) => mapping.slug));
    const coveredActivitySlugs = new Set([...mappedActivitySlugs, ...sessionEvidenceSlugs]);

    place.manualOverrideSlugs = manualOverrideSlugs;
    place.sessionEvidenceSlugs = sessionEvidenceSlugs;
    place.mappedActivitySlugs = mappedActivitySlugs;
    place.coveredActivitySlugs = coveredActivitySlugs;

    const weakMappings = [];
    const staleMappings = [];
    const leakageMappings = [];

    place.mappings.forEach((mapping) => {
      const hasManualSupport = manualOverrideSlugs.includes(mapping.slug);
      const hasSessionSupport = sessionEvidenceSlugs.includes(mapping.slug);
      const hasStrongEvidence = hasManualSupport || hasSessionSupport || mapping.source === 'category';
      const isWeakKeyword = mapping.source === 'keyword' && !hasStrongEvidence && !boundary.hasActivityCategoryEvidence;
      const matchedAt = mapping.matchedAt ? Date.parse(mapping.matchedAt) : NaN;
      const isStaleKeyword =
        mapping.source === 'keyword'
        && !hasStrongEvidence
        && Number.isFinite(matchedAt)
        && matchedAt < staleBefore;
      const isHospitalityLeak =
        boundary.isHospitalityPrimary
        && mapping.source === 'keyword'
        && !hasManualSupport
        && !hasSessionSupport;

      if (isWeakKeyword) weakMappings.push(mapping);
      if (isStaleKeyword) staleMappings.push(mapping);
      if (isHospitalityLeak) leakageMappings.push(mapping);
    });

    const providerDisagreement =
      boundary.isHospitalityPrimary
      && place.mappings.some((mapping) => mapping.source !== 'category')
      && leakageMappings.length === 0;

    const missingSessionMappings = sessionEvidenceSlugs.filter((slug) => !mappedActivitySlugs.has(slug));

    if (manualOverrideSlugs.length) {
      manualOverrideSamples.push(
        toSample(place, { manualOverrideReasons: place.manualOverrides.map((override) => override.reason).filter(Boolean) }),
      );
    }
    if (weakMappings.length) weakMappingSamples.push(toSample(place, { weakMappings: weakMappings.map((mapping) => mapping.slug) }));
    if (staleMappings.length) staleMappingSamples.push(toSample(place, { staleMappings: staleMappings.map((mapping) => mapping.slug) }));
    if (leakageMappings.length) hospitalityLeakSamples.push(toSample(place, { leakageMappings: leakageMappings.map((mapping) => mapping.slug) }));
    if (providerDisagreement) providerDisagreementSamples.push(toSample(place, { disagreementReason: 'hospitality-first provider profile needs manual/session-backed review' }));
    if (missingSessionMappings.length) sessionMappingGapSamples.push(toSample(place, { missingSessionMappings }));

    return place;
  });

  const mappedPlaces = preparedPlaces.filter((place) => place.mappings.length > 0);
  const coverage = buildCoverageReport(standard, preparedPlaces, sampleLimit);

  const weakMappingCount = weakMappingSamples.reduce((total, sample) => total + (sample.weakMappings?.length ?? 0), 0);
  const staleMappingCount = staleMappingSamples.reduce((total, sample) => total + (sample.staleMappings?.length ?? 0), 0);
  const hospitalityLeakCount = hospitalityLeakSamples.reduce((total, sample) => total + (sample.leakageMappings?.length ?? 0), 0);
  const weakMappingRatio = mappedPlaces.length > 0 ? weakMappingCount / mappedPlaces.length : 0;

  const auditSections = {
    hospitalityLeakage: {
      status: gradeUpperBound(hospitalityLeakCount, 0, 2),
      count: hospitalityLeakCount,
      description: 'Hospitality-first places with keyword-only activity mappings and no manual/session support.',
      samples: hospitalityLeakSamples.slice(0, sampleLimit),
    },
    weakMappings: {
      status: gradeRatio(weakMappingRatio, 0.2, 0.4),
      count: weakMappingCount,
      ratio: Number(weakMappingRatio.toFixed(3)),
      description: 'Keyword-only mappings without activity-category, manual-override, or session evidence support.',
      samples: weakMappingSamples.slice(0, sampleLimit),
    },
    staleMappings: {
      status: gradeUpperBound(staleMappingCount, 0, 4),
      count: staleMappingCount,
      description: `Weak keyword mappings older than ${staleMappingDays} days without stronger evidence.`,
      samples: staleMappingSamples.slice(0, sampleLimit),
    },
    duplicateClusters: {
      status: gradeUpperBound(duplicateClusters.length, 0, 2),
      count: duplicateClusters.length,
      description: `Same-name place clusters within ${DUPLICATE_DISTANCE_METERS}m.`,
      samples: duplicateClusters.slice(0, sampleLimit),
    },
    providerDisagreements: {
      status: gradeUpperBound(providerDisagreementSamples.length, 0, 5),
      count: providerDisagreementSamples.length,
      description: 'Hospitality-first provider profiles kept alive only by manual/session-backed exceptions. Review these before launch.',
      samples: providerDisagreementSamples.slice(0, sampleLimit),
    },
    sessionMappingGaps: {
      status: gradeUpperBound(sessionMappingGapSamples.length, 0, 2),
      count: sessionMappingGapSamples.length,
      description: 'Places with activity-specific session evidence that are missing the equivalent venue_activities mapping.',
      samples: sessionMappingGapSamples.slice(0, sampleLimit),
    },
    manualOverrides: {
      status: 'acceptable',
      count: manualOverrideSamples.length,
      description: 'Manual override-backed places that should stay visible in launch review.',
      samples: manualOverrideSamples.slice(0, sampleLimit),
    },
  };

  const coverageStatus = Object.values(coverage).reduce((status, entry) => combineStatus(status, entry.status), 'acceptable');
  const auditsStatus = Object.values(auditSections).reduce((status, entry) => combineStatus(status, entry.status), 'acceptable');
  const overallStatus = combineStatus(coverageStatus, auditsStatus);

  const nextActions = [];
  if (auditSections.hospitalityLeakage.count > 0 || auditSections.staleMappings.count > 0) {
    nextActions.push(`Run pnpm inventory:rematch --city=${city} --apply, then rerun this audit.`);
  }
  if (auditSections.sessionMappingGaps.count > 0) {
    nextActions.push('Review session-backed places that lack venue_activities rows and rerun the matcher/manual overrides as needed.');
  }
  if (Object.values(coverage).some((entry) => entry.status !== 'acceptable')) {
    nextActions.push('Review missing or low-count activity coverage against current seed packs and provider coverage before launch.');
  }
  if (auditSections.duplicateClusters.count > 0) {
    nextActions.push('Inspect duplicate clusters and decide whether provider merge or place canonicalization needs follow-up.');
  }

  return {
    city,
    label: standard.label,
    overallStatus,
    totals: {
      places: preparedPlaces.length,
      mappedPlaces: mappedPlaces.length,
      manualOverridePlaces: manualOverrideSamples.length,
    },
    coverage,
    audits: auditSections,
    blindSpots: [
      'This audit can prove obvious pollution and missing mapping signals, but it cannot prove real-world market completeness.',
      'Imported external events are not counted as canonical activity-mapping evidence in this audit.',
      'Direct launch validation still requires a DB-connected environment and human review of suspicious samples.',
    ],
    nextActions,
  };
};

export const formatCityInventoryReport = (report) => {
  const lines = [];
  lines.push(`[city-inventory-audit] ${report.label}: ${report.overallStatus.toUpperCase()}`);
  lines.push(`places=${report.totals.places} mappedPlaces=${report.totals.mappedPlaces} manualOverridePlaces=${report.totals.manualOverridePlaces}`);
  lines.push('coverage:');
  Object.entries(report.coverage).forEach(([slug, entry]) => {
    lines.push(
      `  - ${slug}: ${entry.count} places (${entry.status})`
      + ` min=${entry.minimum}${entry.reviewOnly ? ' review-only' : ''}`
      + ` sources=${JSON.stringify(entry.sourceBreakdown)}`,
    );
  });
  lines.push('audits:');
  Object.entries(report.audits).forEach(([key, entry]) => {
    const ratioSuffix = typeof entry.ratio === 'number' ? ` ratio=${formatPercent(entry.ratio)}` : '';
    lines.push(`  - ${key}: ${entry.count} (${entry.status})${ratioSuffix}`);
  });
  if (report.nextActions.length) {
    lines.push('nextActions:');
    report.nextActions.forEach((entry) => lines.push(`  - ${entry}`));
  }
  if (report.blindSpots.length) {
    lines.push('blindSpots:');
    report.blindSpots.forEach((entry) => lines.push(`  - ${entry}`));
  }
  return lines.join('\n');
};

export const parseArgs = (argv) => {
  const result = {
    cities: [],
    all: false,
    format: 'table',
    strict: false,
    help: false,
    sampleLimit: SAMPLE_LIMIT_DEFAULT,
    sessionWindowDays: SESSION_EVIDENCE_WINDOW_DAYS_DEFAULT,
    output: '',
  };

  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const [key, rawValue] = arg.slice(2).split('=');
    const value = (rawValue ?? '').trim();
    if (key === 'city' && value) result.cities.push(normalizeComparable(value));
    if (key === 'cities' && value) {
      result.cities.push(...value.split(',').map((entry) => normalizeComparable(entry)).filter(Boolean));
    }
    if (key === 'all') result.all = value !== '0' && value !== 'false';
    if (key === 'format' && value) result.format = value;
    if (key === 'json') result.format = 'json';
    if (key === 'strict') result.strict = value !== '0' && value !== 'false';
    if ((key === 'sampleLimit' || key === 'samples') && value) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) result.sampleLimit = parsed;
    }
    if (key === 'sessionWindowDays' && value) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) result.sessionWindowDays = parsed;
    }
    if (key === 'output' && value) result.output = value;
    if (key === 'help' || key === 'h') result.help = true;
  });

  if (result.all || result.cities.includes('all')) {
    result.cities = Object.keys(TARGET_CITY_STANDARDS);
  } else {
    result.cities = uniq(
      result.cities
        .map((city) => {
          const match = Object.entries(TARGET_CITY_STANDARDS).find(([, standard]) =>
            standard.aliases.some((alias) => normalizeComparable(alias) === city) || standard.slug === city,
          );
          return match?.[0] ?? '';
        })
        .filter(Boolean),
    );
  }

  return result;
};

const printUsage = () => {
  console.log(`Usage:
  pnpm inventory:audit:city --city=hanoi
  pnpm inventory:audit:city --city=bangkok --strict
  pnpm inventory:audit:cities --format=json --output=inventory-audit.json

Environment:
  DATABASE_URL or SUPABASE_DB_URL   Required Postgres connection string

Notes:
  - This audit is deterministic but requires a DB-connected environment.
  - Overall status becomes non-zero with --strict when any city is suspicious or failing.
  - Use pnpm inventory:rematch --city=<slug> --apply before rerunning when stale/hospitality rows are detected.`);
};

const ensureSupportedCities = (cities) => {
  if (cities.length) return;
  console.error('[city-inventory-audit] Provide --city=hanoi|bangkok|danang or --all.');
  printUsage();
  process.exit(1);
};

const createPool = () => {
  const databaseUrl = pickEnv('DATABASE_URL', 'SUPABASE_DB_URL');
  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL (or SUPABASE_DB_URL).');
  }
  const needsSsl = !/localhost|127\.0\.0\.1/i.test(databaseUrl);
  return new Pool({
    connectionString: databaseUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
    max: 2,
    idleTimeoutMillis: 5000,
  });
};

const queryCityPlaces = async (pool, cityKey) => {
  const config = LAUNCH_CITY_CONFIG[cityKey];
  if (!config) {
    throw new Error(`Unknown launch city '${cityKey}'`);
  }
  const { rows } = await pool.query(
    `
      select
        id,
        name,
        city,
        locality,
        region,
        country,
        lat,
        lng,
        categories,
        tags,
        primary_source
      from public.places
      where lat >= $1
        and lat <= $2
        and lng >= $3
        and lng <= $4
      order by name asc
    `,
    [config.bbox.sw.lat, config.bbox.ne.lat, config.bbox.sw.lng, config.bbox.ne.lng],
  );
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
  }));
};

const chunk = (values, size) => {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
};

const attachMappings = async (pool, placesById) => {
  const ids = Array.from(placesById.keys());
  for (const idsChunk of chunk(ids, 180)) {
    const { rows } = await pool.query(
      `
        select
          va.venue_id as place_id,
          va.activity_id,
          ac.slug,
          va.source,
          va.confidence,
          va.matched_at
        from public.venue_activities va
        join public.activity_catalog ac on ac.id = va.activity_id
        where va.venue_id = any($1::uuid[])
      `,
      [idsChunk],
    );
    rows.forEach((row) => {
      const place = placesById.get(row.place_id);
      if (!place) return;
      place.mappings.push({
        activityId: row.activity_id,
        slug: row.slug,
        source: row.source,
        confidence: coerceNumber(row.confidence),
        matchedAt: toIsoDate(row.matched_at),
      });
    });
  }
};

const attachManualOverrides = async (pool, placesById) => {
  const ids = Array.from(placesById.keys());
  for (const idsChunk of chunk(ids, 180)) {
    const { rows } = await pool.query(
      `
        select
          amo.venue_id as place_id,
          amo.activity_id,
          ac.slug,
          amo.reason
        from public.activity_manual_overrides amo
        join public.activity_catalog ac on ac.id = amo.activity_id
        where amo.venue_id = any($1::uuid[])
      `,
      [idsChunk],
    );
    rows.forEach((row) => {
      const place = placesById.get(row.place_id);
      if (!place) return;
      place.manualOverrides.push({
        activityId: row.activity_id,
        slug: row.slug,
        reason: row.reason ?? null,
      });
    });
  }
};

const attachPlaceSources = async (pool, placesById) => {
  const ids = Array.from(placesById.keys());
  for (const idsChunk of chunk(ids, 180)) {
    const { rows } = await pool.query(
      `
        select
          place_id,
          categories
        from public.place_sources
        where place_id = any($1::uuid[])
      `,
      [idsChunk],
    );
    rows.forEach((row) => {
      const place = placesById.get(row.place_id);
      if (!place) return;
      if (Array.isArray(row.categories) && row.categories.length) {
        place.providerCategories.push(row.categories);
      }
    });
  }
};

const attachSessionEvidence = async (pool, placesById, sessionWindowDays) => {
  const ids = Array.from(placesById.keys());
  for (const idsChunk of chunk(ids, 180)) {
    const { rows } = await pool.query(
      `
        select
          s.place_id,
          ac.slug as catalog_slug,
          a.name as activity_name,
          a.tags as activity_tags
        from public.sessions s
        join public.activities a on a.id = s.activity_id
        left join public.activity_catalog ac on ac.id = a.catalog_activity_id
        where s.place_id = any($1::uuid[])
          and s.activity_id is not null
          and coalesce(s.starts_at, s.created_at) >= now() - ($2::text || ' days')::interval
      `,
      [idsChunk, String(sessionWindowDays)],
    );
    rows.forEach((row) => {
      const place = placesById.get(row.place_id);
      if (!place) return;
      const slugs = uniq([
        row.catalog_slug ?? '',
        ...inferActivitySlugsFromText(row.activity_name ?? '', ...(Array.isArray(row.activity_tags) ? row.activity_tags : [])),
      ]);
      place.sessionEvidenceSlugs.push(...slugs);
    });
  }
  placesById.forEach((place) => {
    place.sessionEvidenceSlugs = uniq(place.sessionEvidenceSlugs).sort();
  });
};

const loadCityInventory = async (pool, cityKey, sessionWindowDays) => {
  const places = await queryCityPlaces(pool, cityKey);
  const placesById = new Map(places.map((place) => [place.id, place]));
  await attachMappings(pool, placesById);
  await attachManualOverrides(pool, placesById);
  await attachPlaceSources(pool, placesById);
  await attachSessionEvidence(pool, placesById, sessionWindowDays);
  return places;
};

export const runCityInventoryAudit = async (options) => {
  const pool = createPool();
  try {
    const reports = [];
    for (const city of options.cities) {
      const places = await loadCityInventory(pool, city, options.sessionWindowDays);
      reports.push(
        buildCityInventoryReport({
          city,
          places,
          sampleLimit: options.sampleLimit,
        }),
      );
    }
    return reports;
  } finally {
    await pool.end();
  }
};

const writeOutput = async (outputPath, content) => {
  if (!outputPath) return;
  await writeFile(outputPath, content, 'utf8');
};

export const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  ensureSupportedCities(args.cities);

  const reports = await runCityInventoryAudit(args);
  const payload = args.format === 'json'
    ? JSON.stringify(reports, null, 2)
    : reports.map((report) => formatCityInventoryReport(report)).join('\n\n');

  console.log(payload);
  await writeOutput(args.output, payload);

  if (args.strict && reports.some((report) => report.overallStatus !== 'acceptable')) {
    process.exitCode = 1;
  }
};

const isDirectExecution = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
})();

if (isDirectExecution) {
  main().catch((error) => {
    console.error('[city-inventory-audit] failed', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
