#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const BASE_URL = process.env.CRON_BASE_URL || 'http://localhost:3002';
const secret = process.env.CRON_SECRET;

export const parseArgs = (argv) => {
  const result = {
    city: '',
    placeId: '',
    limit: '',
    dryRun: true,
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
    if (key === 'output') result.output = value;
    if (key === 'dryRun') result.dryRun = value !== '0' && value !== 'false';
    if (key === 'apply') result.dryRun = false;
    if (key === 'help' || key === 'h') result.help = true;
  });

  return result;
};

const printUsage = () => {
  console.log(`Usage:
  pnpm inventory:rematch --city=hanoi
  pnpm inventory:rematch --city=hanoi --apply
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
  - Use --output to save the JSON artifact for launch-review reporting.`);
};

export const buildRematchReport = ({ args, payload, requestedAt, baseUrl }) => {
  const errorCount = Array.isArray(payload?.errors) ? payload.errors.length : 0;
  return {
    city: args.city || null,
    scope: args.placeId ? { placeId: args.placeId } : { city: args.city || '(all)' },
    dryRun: args.dryRun,
    requestedAt,
    baseUrl,
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

  const url = new URL('/api/cron/activity-matcher', BASE_URL);
  if (args.city) url.searchParams.set('city', args.city);
  if (args.placeId) url.searchParams.set('placeId', args.placeId);
  if (args.limit) url.searchParams.set('limit', args.limit);
  url.searchParams.set('dryRun', args.dryRun ? '1' : '0');

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
    args,
    payload,
    requestedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
  });
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
