import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRematchReport,
  parseArgs,
} from '../rematch-venue-activities.mjs';

test('parseArgs supports output and apply mode', () => {
  const args = parseArgs(['--city=bangkok', '--apply', '--output=artifacts/bangkok-rematch-apply.json']);

  assert.equal(args.city, 'bangkok');
  assert.equal(args.dryRun, false);
  assert.equal(args.output, 'artifacts/bangkok-rematch-apply.json');
});

test('buildRematchReport exposes partial run status when matcher returns errors', () => {
  const report = buildRematchReport({
    args: { city: 'hanoi', placeId: '', dryRun: false },
    payload: {
      processed: 12,
      matches: 6,
      upserts: 4,
      deletes: 2,
      hospitalityKeywordDeletes: 1,
      eventEvidenceProtectedMatches: 0,
      manualApplied: 1,
      errors: [{ placeId: 'place-1', message: 'boom' }],
      details: [],
    },
    requestedAt: '2026-03-11T06:15:00.000Z',
    baseUrl: 'https://example.test',
  });

  assert.equal(report.runStatus, 'partial');
  assert.equal(report.errorCount, 1);
  assert.equal(report.city, 'hanoi');
  assert.equal(report.hospitalityKeywordDeletes, 1);
});
