#!/usr/bin/env node

const DEFAULT_TIMEOUT_MINUTES = 90;

const BASE_URL = process.env.CRON_BASE_URL || 'http://localhost:3002';
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error('CRON_SECRET must be set to authenticate the request.');
  process.exit(1);
}

const parseArgs = (argv) => {
  const result = {
    city: '',
    mode: 'full',
    maxTiles: undefined,
    precision: undefined,
    inferActivities: undefined,
    refresh: undefined,
    packs: undefined,
    packVersion: undefined,
    timeoutMinutes: undefined,
    center: undefined,
    sw: undefined,
    ne: undefined,
  };

  argv.forEach((entry) => {
    if (!entry.startsWith('--')) return;
    const [key, rawValue] = entry.slice(2).split('=');
    const value = rawValue ?? '';
    if (key === 'city') result.city = value.trim();
    if (key === 'mode') result.mode = value.trim() || 'full';
    if (key === 'tiles' || key === 'maxTiles') result.maxTiles = value.trim();
    if (key === 'precision') result.precision = value.trim();
    if (key === 'inferActivities') result.inferActivities = value.trim();
    if (key === 'refresh') result.refresh = value.trim();
    if (key === 'packs') result.packs = value.trim();
    if (key === 'packVersion') result.packVersion = value.trim();
    if (key === 'timeoutMinutes' || key === 'timeoutMin') result.timeoutMinutes = value.trim();
    if (key === 'center') result.center = value.trim();
    if (key === 'sw') result.sw = value.trim();
    if (key === 'ne') result.ne = value.trim();
  });

  return result;
};

const args = parseArgs(process.argv.slice(2));

if (!args.city) {
  console.error(
    'Usage: pnpm seed:city --city=<city-slug> [--mode=full|incremental] [--packs=parks_sports,climbing_bouldering] [--maxTiles=120] [--refresh=1] [--packVersion=2026-03-04.v1] [--precision=6] [--timeoutMinutes=90]',
  );
  console.error('Optional for unknown city slugs: --center=<lat,lng> --sw=<lat,lng> --ne=<lat,lng>');
  process.exit(1);
}

const resolveTimeoutMs = () => {
  const fromArgs = args.timeoutMinutes;
  const fromEnv = process.env.SEED_CITY_TIMEOUT_MINUTES;
  const raw = (fromArgs && fromArgs.trim()) || (fromEnv && fromEnv.trim()) || String(DEFAULT_TIMEOUT_MINUTES);
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MINUTES * 60 * 1000;
  return Math.max(60_000, Math.round(parsed * 60 * 1000));
};

const timeoutMs = resolveTimeoutMs();

try {
  const { Agent, setGlobalDispatcher } = await import('undici');
  setGlobalDispatcher(
    new Agent({
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    }),
  );
} catch (error) {
  console.warn('[seed:city] Unable to configure undici timeout; using runtime defaults.', error);
}

const url = new URL('/api/cron/places/seed-city', BASE_URL);
url.searchParams.set('city', args.city);
url.searchParams.set('mode', args.mode || 'full');
if (args.maxTiles) url.searchParams.set('maxTiles', args.maxTiles);
if (args.precision) url.searchParams.set('precision', args.precision);
if (args.inferActivities) url.searchParams.set('inferActivities', args.inferActivities);
if (args.refresh) url.searchParams.set('refresh', args.refresh);
if (args.packs) url.searchParams.set('packs', args.packs);
if (args.packVersion) url.searchParams.set('packVersion', args.packVersion);
if (args.center) url.searchParams.set('center', args.center);
if (args.sw) url.searchParams.set('sw', args.sw);
if (args.ne) url.searchParams.set('ne', args.ne);

(async () => {
  const started = Date.now();
  console.info('[seed:city] configuration', JSON.stringify({ baseUrl: BASE_URL, timeoutMinutes: timeoutMs / 60_000 }));
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[seed:city] request failed', response.status, text);
    process.exit(1);
  }

  const payload = await response.json();
  const elapsedMs = Date.now() - started;
  console.info(
    '[seed:city]',
    JSON.stringify(
      {
        city: payload.city,
        mode: payload.mode,
        packVersion: payload.packVersion,
        packs: payload.packs,
        tilesAttempted: payload.tilesAttempted,
        uniquePlaces: payload.uniquePlaces,
        providerTotals: payload.providerTotals,
        explain: payload.explain,
        inference: payload.inference,
        elapsedMs,
      },
      null,
      2,
    ),
  );
})();
