#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const BASE_URL = process.env.CRON_BASE_URL || 'http://localhost:3002';
const secret = process.env.CRON_SECRET;

const parseOptionalNonNegativeInteger = (value, flagName, fallback = null) => {
  if (value === '' || value == null) return fallback;
  if (!/^\d+$/.test(String(value))) {
    throw new Error(`${flagName} must be a non-negative integer.`);
  }

  return Number.parseInt(String(value), 10);
};

export const parseArgs = (argv) => {
  const result = {
    city: '',
    placeId: '',
    limit: '',
    offset: '',
    batchSize: '',
    dryRun: true,
    all: false,
    output: '',
    help: false,
  };

  argv.forEach((entry) => {
    if (!entry.startsWith('--')) return;
    const [key, rawValue] = entry.slice(2).split('=');
    const value = (rawValue ?? '').trim();
    if (key === 'city') result.city = value;
    if (key === 'placeId') result.placeId = value;
    if (key === 'limit') result.limit = value;
    if (key === 'offset') result.offset = value;
    if (key === 'batchSize') result.batchSize = value;
    if (key === 'output') result.output = value;
    if (key === 'dryRun') result.dryRun = value !== '0' && value !== 'false';
    if (key === 'apply') result.dryRun = false;
    if (key === 'all') result.all = value !== '0' && value !== 'false';
    if (key === 'help' || key === 'h') result.help = true;
  });

  return result;
};

const printUsage = () => {
  console.log(`Usage:
  pnpm inventory:rematch --city=hanoi
  pnpm inventory:rematch --city=hanoi --apply
  pnpm inventory:rematch --city=hanoi --apply --all --batchSize=500
  pnpm inventory:rematch --placeId=<uuid> --apply
  pnpm inventory:rematch --city=bangkok --limit=300 --dryRun=1
  pnpm inventory:rematch --city=bangkok --apply --output=artifacts/bangkok-rematch-apply.json

Environment:
  CRON_BASE_URL   Base URL for the web app cron routes (default: http://localhost:3002)
  CRON_SECRET     Required cron auth secret

Notes:
  - Dry run is the default.
  - This command calls the canonical /api/cron/activity-matcher route.
  - Apply mode will upsert/delete venue_activities using the current matcher policy.
  - Use --all for city-wide batched execution instead of a single limited page.
  - Use --output to save the JSON artifact for launch-review reporting.`);
};

export const buildRematchReport = ({ args, payload, requestedAt, baseUrl }) => {
  const errorCount = Array.isArray(payload?.errors) ? payload.errors.length : 0;
  const limit = parseOptionalNonNegativeInteger(args.limit, '--limit');
  const offset = parseOptionalNonNegativeInteger(args.offset, '--offset', 0);

  return {
    city: args.city || null,
    scope: args.placeId ? { placeId: args.placeId } : { city: args.city || '(all)' },
    dryRun: args.dryRun,
    all: Boolean(args.all),
    requestedAt,
    baseUrl,
    limit,
    offset,
    runStatus: errorCount > 0 ? 'partial' : 'ok',
    processed: payload?.processed ?? null,
    matches: payload?.matches ?? null,
    upserts: payload?.upserts ?? null,
    deletes: payload?.deletes ?? null,
    hospitalityKeywordDeletes: payload?.hospitalityKeywordDeletes ?? null,
    eventEvidenceProtectedMatches: payload?.eventEvidenceProtectedMatches ?? null,
    manualApplied: payload?.manualApplied ?? null,
    errorCount,
    details: payload?.details ?? [],
    errors: Array.isArray(payload?.errors) ? payload.errors : [],
  };
};

export const summarizeRematchBatches = ({ args, reports, requestedAt, baseUrl }) => {
  const limit = parseOptionalNonNegativeInteger(args.batchSize, '--batchSize')
    ?? parseOptionalNonNegativeInteger(args.limit, '--limit');

  const batches = reports.map((report) => ({
    offset: report.offset ?? 0,
    limit: report.limit ?? null,
    runStatus: report.runStatus,
    processed: report.processed ?? 0,
    upserts: report.upserts ?? 0,
    deletes: report.deletes ?? 0,
    hospitalityKeywordDeletes: report.hospitalityKeywordDeletes ?? 0,
    errorCount: report.errorCount ?? 0,
  }));
  const totalErrors = reports.reduce((sum, report) => sum + (report.errorCount ?? 0), 0);
  const hasPartial = reports.some((report) => report.runStatus === 'partial');
  return {
    city: args.city || null,
    scope: args.placeId ? { placeId: args.placeId } : { city: args.city || '(all)' },
    dryRun: args.dryRun,
    all: true,
    requestedAt,
    baseUrl,
    limit,
    offset: 0,
    runStatus: hasPartial ? 'partial' : 'ok',
    processed: reports.reduce((sum, report) => sum + (report.processed ?? 0), 0),
    matches: reports.reduce((sum, report) => sum + (report.matches ?? 0), 0),
    upserts: reports.reduce((sum, report) => sum + (report.upserts ?? 0), 0),
    deletes: reports.reduce((sum, report) => sum + (report.deletes ?? 0), 0),
    hospitalityKeywordDeletes: reports.reduce((sum, report) => sum + (report.hospitalityKeywordDeletes ?? 0), 0),
    eventEvidenceProtectedMatches: reports.reduce((sum, report) => sum + (report.eventEvidenceProtectedMatches ?? 0), 0),
    manualApplied: reports.reduce((sum, report) => sum + (report.manualApplied ?? 0), 0),
    errorCount: totalErrors,
    details: reports.flatMap((report) => report.details ?? []).slice(0, 50),
    errors: reports.flatMap((report) => report.errors ?? []),
    batches,
    batchCount: reports.length,
  };
};

const writeOutput = async (outputPath, content) => {
  if (!outputPath) return;
  await writeFile(outputPath, content, 'utf8');
};

export const executeRematch = async (args) => {
  if (!secret) {
    throw new Error('CRON_SECRET must be set.');
  }

  if (!args.city && !args.placeId) {
    throw new Error('Provide --city=<slug> or --placeId=<uuid>.');
  }

  parseOptionalNonNegativeInteger(args.limit, '--limit');
  parseOptionalNonNegativeInteger(args.offset, '--offset', 0);
  parseOptionalNonNegativeInteger(args.batchSize, '--batchSize');

  const executeBatch = async (batchArgs) => {
    const url = new URL('/api/cron/activity-matcher', BASE_URL);
    if (batchArgs.city) url.searchParams.set('city', batchArgs.city);
    if (batchArgs.placeId) url.searchParams.set('placeId', batchArgs.placeId);
    if (batchArgs.limit) url.searchParams.set('limit', batchArgs.limit);
    if (batchArgs.offset) url.searchParams.set('offset', batchArgs.offset);
    url.searchParams.set('dryRun', batchArgs.dryRun ? '1' : '0');

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    });

    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (!response.ok) {
      throw new Error(`request failed ${response.status} ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
    }

    return buildRematchReport({
      args: batchArgs,
      payload,
      requestedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
    });
  };

  if (args.all && args.city && !args.placeId) {
    const requestedBatchSize = parseOptionalNonNegativeInteger(args.batchSize, '--batchSize')
      ?? parseOptionalNonNegativeInteger(args.limit, '--limit')
      ?? 500;
    const batchSize = String(Math.min(500, Math.max(1, requestedBatchSize)));
    const reports = [];
    let offset = parseOptionalNonNegativeInteger(args.offset, '--offset', 0);
    while (true) {
      const batchReport = await executeBatch({ ...args, limit: batchSize, offset: String(offset), all: false });
      reports.push(batchReport);
      if ((batchReport.processed ?? 0) < Number(batchSize) || batchReport.runStatus === 'partial') {
        break;
      }
      offset += Number(batchSize);
    }
    return summarizeRematchBatches({
      args: { ...args, batchSize: batchSize },
      reports,
      requestedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
    });
  }

  return executeBatch(args);
};

export const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  if (!secret) {
    console.error('[inventory:rematch] CRON_SECRET must be set.');
    process.exit(1);
  }

  if (!args.city && !args.placeId) {
    console.error('[inventory:rematch] Provide --city=<slug> or --placeId=<uuid>.');
    printUsage();
    process.exit(1);
  }

  try {
    const report = await executeRematch(args);
    const serialized = JSON.stringify(report, null, 2);
    console.log(serialized);
    await writeOutput(args.output, serialized);
  } catch (error) {
    console.error('[inventory:rematch] failed', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
};

const isDirectExecution = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
})();

if (isDirectExecution) {
  main();
}
