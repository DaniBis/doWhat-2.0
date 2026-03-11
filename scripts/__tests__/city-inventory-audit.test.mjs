import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCityInventoryReport,
  parseArgs,
} from '../city-inventory-audit.mjs';

const createPlace = ({
  id,
  name,
  lat,
  lng,
  categories = ['fitness'],
  tags = [],
  mappings = [],
  manualOverrides = [],
  sessionEvidenceSlugs = [],
  providerCategories = [],
}) => ({
  id,
  name,
  city: 'Hanoi',
  locality: 'Hanoi',
  region: null,
  country: 'VN',
  lat,
  lng,
  categories,
  tags,
  primarySource: 'foursquare',
  mappings,
  manualOverrides,
  sessionEvidenceSlugs,
  providerCategories,
});

const mapping = (slug, source = 'category', confidence = 0.92, matchedAt = '2026-03-01T00:00:00.000Z') => ({
  activityId: slug,
  slug,
  source,
  confidence,
  matchedAt,
});

const buildHanoiRequiredCoverage = ({ includeChess = true } = {}) => {
  const places = [
    createPlace({
      id: 'place-climb-1',
      name: 'Peak Climbing Gym',
      lat: 21.03,
      lng: 105.84,
      mappings: [mapping('climbing'), mapping('bouldering')],
    }),
    createPlace({
      id: 'place-climb-2',
      name: 'Boulder Hub',
      lat: 21.031,
      lng: 105.841,
      mappings: [mapping('climbing'), mapping('bouldering')],
    }),
    createPlace({
      id: 'place-yoga-1',
      name: 'Flow Yoga West Lake',
      lat: 21.05,
      lng: 105.81,
      mappings: [mapping('yoga')],
    }),
    createPlace({
      id: 'place-yoga-2',
      name: 'Sunrise Yoga Studio',
      lat: 21.052,
      lng: 105.812,
      mappings: [mapping('yoga')],
    }),
    createPlace({
      id: 'place-run-1',
      name: 'Running Track Hanoi',
      lat: 21.02,
      lng: 105.83,
      mappings: [mapping('running')],
    }),
    createPlace({
      id: 'place-run-2',
      name: 'West Lake Run Club',
      lat: 21.06,
      lng: 105.82,
      mappings: [mapping('running')],
    }),
  ];
  if (includeChess) {
    places.push(
      createPlace({
        id: 'place-chess-1',
        name: 'Hanoi Chess Club',
        lat: 21.04,
        lng: 105.85,
        mappings: [mapping('chess', 'keyword', 0.6)],
      }),
    );
  }
  return places;
};

test('flags hospitality keyword leakage', () => {
  const report = buildCityInventoryReport({
    city: 'hanoi',
    places: [
      createPlace({
        id: 'place-cafe',
        name: 'Chess Cafe',
        lat: 21.01,
        lng: 105.85,
        categories: ['coffee'],
        tags: ['cafe'],
        providerCategories: [['coffee shop']],
        mappings: [mapping('chess', 'keyword', 0.6)],
      }),
    ],
  });

  assert.equal(report.audits.hospitalityLeakage.count, 1);
  assert.equal(report.audits.hospitalityLeakage.status, 'suspicious');
  assert.equal(report.audits.providerDisagreements.count, 0);
});

test('keeps hospitality exceptions out of leakage when session evidence exists', () => {
  const report = buildCityInventoryReport({
    city: 'hanoi',
    places: [
      createPlace({
        id: 'place-cafe-supported',
        name: 'Chess Cafe',
        lat: 21.01,
        lng: 105.85,
        categories: ['coffee'],
        tags: ['cafe'],
        providerCategories: [['coffee shop']],
        mappings: [mapping('chess', 'keyword', 0.6)],
        sessionEvidenceSlugs: ['chess'],
      }),
    ],
  });

  assert.equal(report.audits.hospitalityLeakage.count, 0);
  assert.equal(report.audits.providerDisagreements.count, 1);
});

test('grades missing required Bangkok padel coverage as failing', () => {
  const report = buildCityInventoryReport({
    city: 'bangkok',
    places: [
      createPlace({
        id: 'place-climb-1',
        name: 'Bangkok Climb One',
        lat: 13.75,
        lng: 100.51,
        mappings: [mapping('climbing'), mapping('bouldering')],
      }),
      createPlace({
        id: 'place-climb-2',
        name: 'Bangkok Climb Two',
        lat: 13.751,
        lng: 100.512,
        mappings: [mapping('climbing'), mapping('bouldering')],
      }),
      createPlace({
        id: 'place-climb-3',
        name: 'Bangkok Climb Three',
        lat: 13.752,
        lng: 100.514,
        mappings: [mapping('climbing')],
      }),
      createPlace({
        id: 'place-yoga-1',
        name: 'Bangkok Yoga One',
        lat: 13.76,
        lng: 100.53,
        mappings: [mapping('yoga')],
      }),
      createPlace({
        id: 'place-yoga-2',
        name: 'Bangkok Yoga Two',
        lat: 13.761,
        lng: 100.531,
        mappings: [mapping('yoga')],
      }),
      createPlace({
        id: 'place-run-1',
        name: 'Bangkok Run One',
        lat: 13.77,
        lng: 100.54,
        mappings: [mapping('running')],
      }),
      createPlace({
        id: 'place-run-2',
        name: 'Bangkok Run Two',
        lat: 13.771,
        lng: 100.541,
        mappings: [mapping('running')],
      }),
    ],
  });

  assert.equal(report.coverage.padel.status, 'failing');
  assert.equal(report.overallStatus, 'failing');
});

test('treats review-only chess coverage as suspicious, not failing', () => {
  const report = buildCityInventoryReport({
    city: 'hanoi',
    places: buildHanoiRequiredCoverage({ includeChess: false }),
  });

  assert.equal(report.coverage.chess.status, 'suspicious');
  assert.equal(report.overallStatus, 'suspicious');
});

test('detects duplicate clusters by normalized name and proximity', () => {
  const report = buildCityInventoryReport({
    city: 'hanoi',
    places: [
      ...buildHanoiRequiredCoverage(),
      createPlace({
        id: 'duplicate-1',
        name: 'Peak Climbing Gym',
        lat: 21.0304,
        lng: 105.8403,
        mappings: [mapping('climbing')],
      }),
    ],
  });

  assert.equal(report.audits.duplicateClusters.count, 1);
  assert.equal(report.audits.duplicateClusters.samples[0].normalizedName, 'peakclimbinggym');
});

test('flags session evidence without venue activity mapping', () => {
  const report = buildCityInventoryReport({
    city: 'hanoi',
    places: [
      ...buildHanoiRequiredCoverage(),
      createPlace({
        id: 'gap-place',
        name: 'Unmapped Yoga Meetup Spot',
        lat: 21.08,
        lng: 105.86,
        mappings: [],
        sessionEvidenceSlugs: ['yoga'],
      }),
    ],
  });

  assert.equal(report.audits.sessionMappingGaps.count, 1);
  assert.equal(report.audits.sessionMappingGaps.status, 'suspicious');
});

test('parseArgs normalizes target cities and strict json flags', () => {
  const args = parseArgs(['--cities=Ha Noi,Da Nang', '--json', '--strict']);

  assert.deepEqual(args.cities, ['hanoi', 'danang']);
  assert.equal(args.format, 'json');
  assert.equal(args.strict, true);
});
