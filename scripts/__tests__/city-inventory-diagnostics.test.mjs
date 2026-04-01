import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCityInventoryDiagnosticsReport,
  buildCityScopeDiagnostics,
  buildSeedStageDiagnostics,
  matchesCurrentCityScope,
  matchesLegacyStringCityScope,
  matchesNormalizedCityScope,
  parseArgs,
} from '../city-inventory-diagnostics.mjs';
import { normalizeScopeValue } from '../utils/launch-city-config.mjs';

const createPlace = ({
  id,
  name,
  city = null,
  locality = null,
  categories = ['fitness'],
  tags = [],
  mappings = [],
  manualOverrides = [],
  sessionEvidenceSlugs = [],
  providerCategories = [],
  primarySource = 'foursquare',
  lat = 0,
  lng = 0,
}) => ({
  id,
  name,
  city,
  locality,
  region: null,
  country: 'VN',
  lat,
  lng,
  categories,
  tags,
  primarySource,
  providerSourceRows: [],
  mappings,
  manualOverrides,
  sessionEvidenceSlugs,
  providerCategories,
});

const mapping = (slug, source = 'category') => ({
  activityId: slug,
  slug,
  source,
  confidence: 0.92,
  matchedAt: '2026-03-01T00:00:00.000Z',
});

test('normalizeScopeValue removes accents and spacing noise', () => {
  assert.equal(normalizeScopeValue('Hà Nội'), 'hanoi');
  assert.equal(normalizeScopeValue('Đà Nẵng'), 'danang');
  assert.equal(normalizeScopeValue('Bangkok, Thailand'), 'bangkokthailand');
});

test('legacy string city scope misses Da Nang spacing and accent variants but current scope catches them', () => {
  const asciiSpaced = createPlace({ id: '1', name: 'Yoga', city: 'Da Nang', locality: 'Da Nang' });
  const accented = createPlace({ id: '2', name: 'Climb', city: 'Đà Nẵng', locality: 'Đà Nẵng' });

  assert.equal(matchesLegacyStringCityScope(asciiSpaced, 'danang'), false);
  assert.equal(matchesLegacyStringCityScope(accented, 'danang'), false);
  assert.equal(matchesCurrentCityScope(asciiSpaced, 'danang'), true);
  assert.equal(matchesCurrentCityScope(accented, 'danang'), true);
  assert.equal(matchesNormalizedCityScope(asciiSpaced, 'danang'), true);
  assert.equal(matchesNormalizedCityScope(accented, 'danang'), true);
});

test('alias-based city scope still misses Bangkok district labels without bbox support', () => {
  const district = createPlace({ id: '3', name: 'Padel', city: 'คลองเตย', locality: 'คลองเตย' });
  assert.equal(matchesCurrentCityScope(district, 'bangkok'), false);
  assert.equal(matchesNormalizedCityScope(district, 'bangkok'), false);
});

test('buildSeedStageDiagnostics aggregates seed explain counts and drop reasons', () => {
  const report = buildSeedStageDiagnostics({
    city: 'hanoi',
    packVersion: '2026-03-04.v1',
    rows: [
      {
        geohash6: 'w21z9v',
        discovery_cache: {
          'seed:2026-03-04.v1:hanoi:w21z9v:parks_sports:abc': {
            pack: 'parks_sports',
            providerCounts: { foursquare: 3, openstreetmap: 4, google_places: 0 },
            explain: {
              itemsBeforeDedupe: 20,
              itemsAfterDedupe: 10,
              itemsAfterGates: 8,
              itemsAfterFilters: 6,
              dropReasons: { blockedHospitality: 2, missingCoordinates: 1 },
            },
          },
        },
      },
      {
        geohash6: 'w21z9w',
        discovery_cache: {
          'seed:2026-03-04.v1:hanoi:w21z9w:climbing_bouldering:def': {
            pack: 'climbing_bouldering',
            provider_counts: { foursquare: 2, openstreetmap: 1, google_places: 1 },
            explain: {
              itemsBeforeDedupe: 9,
              itemsAfterDedupe: 7,
              itemsAfterGates: 5,
              itemsAfterFilters: 4,
              dropReasons: { blockedHospitality: 1, duplicate: 2 },
            },
          },
        },
      },
    ],
  });

  assert.equal(report.tilesTouched, 2);
  assert.equal(report.cacheEntries, 2);
  assert.equal(report.fetchedCount, 29);
  assert.equal(report.filteredCount, 10);
  assert.equal(report.rejectedCount, 19);
  assert.equal(report.hospitalityRejectedCount, 3);
  assert.deepEqual(report.providerCounts, { openstreetmap: 5, foursquare: 5, google_places: 1 });
  assert.equal(report.rejectedByReason.blockedHospitality, 3);
  assert.equal(report.rejectedByReason.duplicate, 2);
});

test('buildCityScopeDiagnostics exposes current-scope misses and normalization failures', () => {
  const report = buildCityScopeDiagnostics({
    city: 'hanoi',
    places: [
      createPlace({ id: '1', name: 'Gym A', city: 'Hà Nội', locality: 'Hà Nội', lat: 21.0285, lng: 105.8542 }),
      createPlace({ id: '2', name: 'Gym B', city: 'Hanoi', locality: 'Hanoi', lat: 21.03, lng: 105.85 }),
      createPlace({ id: '3', name: 'Gym C', city: null, locality: null, lat: 21.04, lng: 105.84 }),
      createPlace({ id: '4', name: 'Gym D', city: 'Tây Hồ', locality: 'Tây Hồ', lat: 21.06, lng: 105.81 }),
    ],
  });

  assert.equal(report.bboxPlaceCount, 4);
  assert.equal(report.currentScopeCount, 4);
  assert.equal(report.legacyStringScopeCount, 1);
  assert.equal(report.normalizedScopeCount, 2);
  assert.equal(report.currentScopeMissCount, 0);
  assert.equal(report.normalizedFalseNegativeCount, 1);
  assert.equal(report.nullCityFieldsCount, 1);
  assert.equal(report.districtOrOtherLocalityCount, 1);
  assert.equal(report.statuses.currentScope, 'acceptable');
  assert.equal(report.statuses.legacyStringScope, 'suspicious');
});

test('buildCityInventoryDiagnosticsReport no longer reports city-scope collapse when bbox-scoped rows are available', () => {
  const report = buildCityInventoryDiagnosticsReport({
    city: 'bangkok',
    seed: {
      cacheEntries: 3,
      tilesTouched: 3,
      packsSeen: ['parks_sports'],
      packEntryCounts: { parks_sports: 3 },
      fetchedCount: 180,
      dedupedCount: 120,
      gatedCount: 80,
      filteredCount: 50,
      rejectedCount: 130,
      rejectedByReason: { blockedHospitality: 20 },
      hospitalityRejectedCount: 20,
      providerCounts: { openstreetmap: 50, foursquare: 10, google_places: 0 },
    },
    places: [
      createPlace({
        id: 'district-1',
        name: 'คลองเตย Park Track',
        city: 'คลองเตย',
        locality: 'คลองเตย',
        lat: 13.7563,
        lng: 100.5018,
        categories: ['park'],
        mappings: [mapping('running')],
      }),
      createPlace({
        id: 'district-2',
        name: 'คลองเตย Yoga',
        city: 'คลองเตย',
        locality: 'คลองเตย',
        lat: 13.757,
        lng: 100.502,
        categories: ['fitness'],
        mappings: [mapping('yoga')],
      }),
      createPlace({
        id: 'noise-1',
        name: 'Cafe Noise',
        city: null,
        locality: null,
        lat: 13.758,
        lng: 100.503,
        categories: ['coffee'],
        tags: ['cafe'],
      }),
    ],
  });

  assert.equal(report.scope.currentScopeCount, 3);
  assert.equal(report.scope.legacyStringScopeCount, 0);
  assert.equal(report.inventory.hospitalityRejectedCount, 1);
  assert.equal(report.rootCauses.some((cause) => cause.key === 'city_scope_collapse'), false);
});

test('parseArgs resolves all city aliases and output format', () => {
  const args = parseArgs(['--cities=Ha Noi,Đà Nẵng', '--json', '--output=diag.json']);
  assert.deepEqual(args.cities, ['hanoi', 'danang']);
  assert.equal(args.format, 'json');
  assert.equal(args.output, 'diag.json');
});
