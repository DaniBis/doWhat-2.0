import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRematchReport,
  parseArgs,
  summarizeRematchBatches,
} from '../rematch-venue-activities.mjs';

test('parseArgs supports output and apply mode', () => {
  const args = parseArgs(['--city=bangkok', '--apply', '--output=artifacts/bangkok-rematch-apply.json']);

  assert.equal(args.city, 'bangkok');
  assert.equal(args.dryRun, false);
  assert.equal(args.output, 'artifacts/bangkok-rematch-apply.json');
});

test('parseArgs supports full-city batched execution flags', () => {
  const args = parseArgs(['--city=hanoi', '--apply', '--all', '--batchSize=500', '--offset=1000']);

  assert.equal(args.city, 'hanoi');
  assert.equal(args.dryRun, false);
  assert.equal(args.all, true);
  assert.equal(args.batchSize, '500');
  assert.equal(args.offset, '1000');
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

test('buildRematchReport rejects invalid numeric args before JSON serialization', () => {
  assert.throws(
    () => buildRematchReport({
      args: { city: 'hanoi', placeId: '', dryRun: false, limit: 'abc', offset: '10' },
      payload: { errors: [], details: [] },
      requestedAt: '2026-03-11T06:15:00.000Z',
      baseUrl: 'https://example.test',
    }),
    /--limit must be a non-negative integer/,
  );

  assert.throws(
    () => buildRematchReport({
      args: { city: 'hanoi', placeId: '', dryRun: false, limit: '10', offset: '-1' },
      payload: { errors: [], details: [] },
      requestedAt: '2026-03-11T06:15:00.000Z',
      baseUrl: 'https://example.test',
    }),
    /--offset must be a non-negative integer/,
  );
});

test('summarizeRematchBatches aggregates full-city rematch reports', () => {
  const report = summarizeRematchBatches({
    args: { city: 'danang', placeId: '', dryRun: false, batchSize: '500' },
    reports: [
      buildRematchReport({
        args: { city: 'danang', placeId: '', dryRun: false, limit: '500', offset: '0' },
        payload: {
          processed: 500,
          matches: 40,
          upserts: 20,
          deletes: 6,
          hospitalityKeywordDeletes: 4,
          eventEvidenceProtectedMatches: 2,
          manualApplied: 1,
          errors: [],
          details: [],
        },
        requestedAt: '2026-03-11T14:40:00.000Z',
        baseUrl: 'https://example.test',
      }),
      buildRematchReport({
        args: { city: 'danang', placeId: '', dryRun: false, limit: '500', offset: '500' },
        payload: {
          processed: 186,
          matches: 25,
          upserts: 9,
          deletes: 3,
          hospitalityKeywordDeletes: 1,
          eventEvidenceProtectedMatches: 1,
          manualApplied: 0,
          errors: [],
          details: [],
        },
        requestedAt: '2026-03-11T14:41:00.000Z',
        baseUrl: 'https://example.test',
      }),
    ],
    requestedAt: '2026-03-11T14:42:00.000Z',
    baseUrl: 'https://example.test',
  });

  assert.equal(report.runStatus, 'ok');
  assert.equal(report.processed, 686);
  assert.equal(report.upserts, 29);
  assert.equal(report.hospitalityKeywordDeletes, 5);
  assert.equal(report.batchCount, 2);
});

test('summarizeRematchBatches rejects invalid batch size before numeric coercion', () => {
  assert.throws(
    () => summarizeRematchBatches({
      args: { city: 'danang', placeId: '', dryRun: false, batchSize: 'bad-batch' },
      reports: [],
      requestedAt: '2026-03-11T14:42:00.000Z',
      baseUrl: 'https://example.test',
    }),
    /--batchSize must be a non-negative integer/,
  );
});
