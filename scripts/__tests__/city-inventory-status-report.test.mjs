import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCityStatusSummary,
  formatStatusReport,
  parseArgs,
} from '../city-inventory-status-report.mjs';

const createAudit = ({
  label = 'Hanoi',
  overallStatus = 'acceptable',
  hospitalityLeakageStatus = 'acceptable',
  duplicateStatus = 'acceptable',
  staleStatus = 'acceptable',
  weakStatus = 'acceptable',
  sessionGapStatus = 'acceptable',
  providerDisagreements = 0,
  sessionMappingGaps = 0,
  hospitalityLeakage = 0,
} = {}) => ({
  label,
  overallStatus,
  coverage: {
    climbing: { status: overallStatus === 'failing' ? 'failing' : 'acceptable' },
    yoga: { status: 'acceptable' },
  },
  audits: {
    hospitalityLeakage: {
      status: hospitalityLeakageStatus,
      count: hospitalityLeakage,
      samples: hospitalityLeakage ? [{ placeId: 'place-1', name: 'Cafe Leak' }] : [],
    },
    duplicateClusters: {
      status: duplicateStatus,
      count: duplicateStatus === 'acceptable' ? 0 : 1,
      samples: duplicateStatus === 'acceptable' ? [] : [{ normalizedName: 'peakclimbinggym' }],
    },
    staleMappings: {
      status: staleStatus,
      count: staleStatus === 'acceptable' ? 0 : 2,
      samples: staleStatus === 'acceptable' ? [] : [{ placeId: 'place-2' }],
    },
    weakMappings: {
      status: weakStatus,
      count: weakStatus === 'acceptable' ? 0 : 3,
      samples: weakStatus === 'acceptable' ? [] : [{ placeId: 'place-3' }],
    },
    sessionMappingGaps: {
      status: sessionGapStatus,
      count: sessionMappingGaps,
      samples: sessionMappingGaps ? [{ placeId: 'gap-1' }] : [],
    },
    providerDisagreements: {
      status: providerDisagreements > 0 ? 'suspicious' : 'acceptable',
      count: providerDisagreements,
      samples: providerDisagreements ? [{ placeId: 'provider-1' }] : [],
    },
    manualOverrides: {
      status: 'acceptable',
      count: 0,
      samples: [],
    },
  },
});

test('buildCityStatusSummary marks city blocked when audit is missing', () => {
  const summary = buildCityStatusSummary({
    city: 'hanoi',
    dryRun: null,
    apply: null,
    audit: null,
  });

  assert.equal(summary.rematchRunStatus, 'missing');
  assert.equal(summary.auditStatus, 'missing');
  assert.equal(summary.launchRecommendation, 'blocked');
});

test('buildCityStatusSummary marks manual review when audit is suspicious', () => {
  const summary = buildCityStatusSummary({
    city: 'hanoi',
    dryRun: { runStatus: 'ok', errorCount: 0, hospitalityKeywordDeletes: 1, deletes: 1, eventEvidenceProtectedMatches: 0 },
    apply: { runStatus: 'ok', errorCount: 0, hospitalityKeywordDeletes: 1, deletes: 1, eventEvidenceProtectedMatches: 0 },
    audit: createAudit({
      overallStatus: 'suspicious',
      hospitalityLeakageStatus: 'acceptable',
      sessionMappingGaps: 1,
      sessionGapStatus: 'suspicious',
    }),
  });

  assert.equal(summary.rematchRunStatus, 'applied');
  assert.equal(summary.manualReviewRequired, true);
  assert.equal(summary.launchRecommendation, 'manual-review-required');
});

test('buildCityStatusSummary marks blocked when rematch apply has errors', () => {
  const summary = buildCityStatusSummary({
    city: 'bangkok',
    dryRun: { runStatus: 'ok', errorCount: 0 },
    apply: { runStatus: 'partial', errorCount: 2 },
    audit: createAudit(),
  });

  assert.equal(summary.rematchRunStatus, 'error');
  assert.equal(summary.launchRecommendation, 'blocked');
});

test('formatStatusReport emits markdown with manual review candidates', () => {
  const report = formatStatusReport(
    [
      buildCityStatusSummary({
        city: 'hanoi',
        dryRun: { runStatus: 'ok', errorCount: 0 },
        apply: { runStatus: 'ok', errorCount: 0 },
        audit: createAudit({
          overallStatus: 'suspicious',
          duplicateStatus: 'suspicious',
          providerDisagreements: 1,
        }),
      }),
    ],
    'markdown',
  );

  assert.match(report, /## Hanoi/);
  assert.match(report, /manual review candidates:/i);
  assert.match(report, /Hospitality exceptions to verify/);
});

test('parseArgs normalizes city selection and strict mode', () => {
  const args = parseArgs(['--dir=artifacts/run-1', '--cities=Hanoi,Bangkok', '--markdown', '--strict']);

  assert.equal(args.dir, 'artifacts/run-1');
  assert.deepEqual(args.cities, ['hanoi', 'bangkok']);
  assert.equal(args.format, 'markdown');
  assert.equal(args.strict, true);
});
