#!/usr/bin/env node

const BASE_URL = process.env.CRON_BASE_URL || 'http://localhost:3002';
const secret = process.env.CRON_SECRET;

const parseArgs = (argv) => {
  const result = {
    city: '',
    placeId: '',
    limit: '',
    dryRun: true,
    help: false,
  };

  argv.forEach((entry) => {
    if (!entry.startsWith('--')) return;
    const [key, rawValue] = entry.slice(2).split('=');
    const value = (rawValue ?? '').trim();
    if (key === 'city') result.city = value;
    if (key === 'placeId') result.placeId = value;
    if (key === 'limit') result.limit = value;
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

Environment:
  CRON_BASE_URL   Base URL for the web app cron routes (default: http://localhost:3002)
  CRON_SECRET     Required cron auth secret

Notes:
  - Dry run is the default.
  - This command calls the canonical /api/cron/activity-matcher route.
  - Apply mode will upsert/delete venue_activities using the current matcher policy.`);
};

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
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

const url = new URL('/api/cron/activity-matcher', BASE_URL);
if (args.city) url.searchParams.set('city', args.city);
if (args.placeId) url.searchParams.set('placeId', args.placeId);
if (args.limit) url.searchParams.set('limit', args.limit);
url.searchParams.set('dryRun', args.dryRun ? '1' : '0');

try {
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
    console.error('[inventory:rematch] request failed', response.status, payload);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        scope: args.placeId ? { placeId: args.placeId } : { city: args.city || '(all)' },
        dryRun: args.dryRun,
        processed: payload?.processed ?? null,
        matches: payload?.matches ?? null,
        upserts: payload?.upserts ?? null,
        deletes: payload?.deletes ?? null,
        hospitalityKeywordDeletes: payload?.hospitalityKeywordDeletes ?? null,
        eventEvidenceProtectedMatches: payload?.eventEvidenceProtectedMatches ?? null,
        manualApplied: payload?.manualApplied ?? null,
        errors: Array.isArray(payload?.errors) ? payload.errors.length : null,
        details: payload?.details ?? [],
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error('[inventory:rematch] failed', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
