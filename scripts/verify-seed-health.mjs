#!/usr/bin/env node
import process from 'node:process';
import pg from 'pg';

import loadEnv from './utils/load-env.mjs';

loadEnv(['.env.local', 'apps/doWhat-web/.env.local', 'apps/doWhat-mobile/.env.local']);

const { Pool } = pg;

const pickEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

const parseArgs = (argv) => {
  const result = {
    city: '',
    packVersion: process.env.SEED_PACK_VERSION || '2026-03-04.v1',
    maxAgeHours: 240,
    packs: [],
  };

  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const [key, rawValue] = arg.slice(2).split('=');
    const value = (rawValue ?? '').trim();
    if (key === 'city') result.city = value.toLowerCase();
    if (key === 'packVersion' && value) result.packVersion = value;
    if (key === 'maxAgeHours' && value) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) result.maxAgeHours = parsed;
    }
    if (key === 'packs' && value) {
      result.packs = value
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
    }
  });

  return result;
};

const defaultsByCity = {
  hanoi: ['parks_sports', 'climbing_bouldering'],
  bangkok: ['parks_sports', 'climbing_bouldering'],
  danang: ['parks_sports', 'climbing_bouldering'],
};

const args = parseArgs(process.argv.slice(2));

if (!args.city) {
  console.error('Usage: pnpm verify:seed-health --city=hanoi|bangkok|danang [--packVersion=...] [--maxAgeHours=240] [--packs=...]');
  process.exit(1);
}

const requiredPacks = args.packs.length ? args.packs : defaultsByCity[args.city] ?? ['parks_sports', 'climbing_bouldering'];
const databaseUrl = pickEnv('DATABASE_URL', 'SUPABASE_DB_URL');
if (!databaseUrl) {
  console.error('[verify-seed-health] Missing DATABASE_URL (or SUPABASE_DB_URL).');
  process.exit(1);
}

const needsSsl = !/localhost|127\\.0\\.0\\.1/i.test(databaseUrl);
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: 2,
  idleTimeoutMillis: 5000,
});

const closePool = async () => {
  try {
    await pool.end();
  } catch (error) {
    console.warn('[verify-seed-health] Failed to close pool', error);
  }
};

const toProviderCounts = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { openstreetmap: 0, foursquare: 0, google_places: 0 };
  }
  return {
    openstreetmap: Number(value.openstreetmap ?? 0) || 0,
    foursquare: Number(value.foursquare ?? 0) || 0,
    google_places: Number(value.google_places ?? 0) || 0,
  };
};

const addProviderCounts = (target, delta) => {
  target.openstreetmap += delta.openstreetmap ?? 0;
  target.foursquare += delta.foursquare ?? 0;
  target.google_places += delta.google_places ?? 0;
};

const sumProviders = (counts) => counts.openstreetmap + counts.foursquare + counts.google_places;

const main = async () => {
  const sql = `
    SELECT geohash6, refreshed_at, discovery_cache
    FROM public.place_tiles
    WHERE discovery_cache IS NOT NULL
      AND discovery_cache <> '{}'::jsonb
      AND refreshed_at >= NOW() - ($1::text || ' hours')::interval
  `;
  const { rows } = await pool.query(sql, [String(args.maxAgeHours)]);

  const prefix = `seed:${args.packVersion}:${args.city}:`;
  const tiles = new Set();
  const packsSeen = new Set();
  const providerTotals = { openstreetmap: 0, foursquare: 0, google_places: 0 };
  const providerByPack = new Map();

  rows.forEach((row) => {
    const cache = row.discovery_cache;
    if (!cache || typeof cache !== 'object' || Array.isArray(cache)) return;
    const entries = Object.entries(cache);
    entries.forEach(([key, value]) => {
      if (!key.startsWith(prefix)) return;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const pack = String(value.pack ?? '').trim().toLowerCase();
      const counts = toProviderCounts(value.providerCounts ?? value.provider_counts ?? {});
      tiles.add(row.geohash6);
      if (pack) packsSeen.add(pack);
      addProviderCounts(providerTotals, counts);
      if (pack) {
        const bucket = providerByPack.get(pack) ?? { openstreetmap: 0, foursquare: 0, google_places: 0 };
        addProviderCounts(bucket, counts);
        providerByPack.set(pack, bucket);
      }
    });
  });

  console.log('[verify-seed-health] summary');
  console.table({
    city: args.city,
    packVersion: args.packVersion,
    tilesTouched: tiles.size,
    packsSeen: Array.from(packsSeen).sort().join(', ') || '(none)',
    openstreetmap: providerTotals.openstreetmap,
    foursquare: providerTotals.foursquare,
    google_places: providerTotals.google_places,
  });

  const failures = [];
  if (tiles.size === 0) {
    failures.push(`No tiles touched for city=${args.city}, packVersion=${args.packVersion} in the last ${args.maxAgeHours}h.`);
  }
  requiredPacks.forEach((pack) => {
    if (!packsSeen.has(pack)) {
      failures.push(`Missing pack '${pack}' in discovery_cache for city=${args.city}.`);
      return;
    }
    const perPack = providerByPack.get(pack) ?? { openstreetmap: 0, foursquare: 0, google_places: 0 };
    if (sumProviders(perPack) <= 0) {
      failures.push(`Pack '${pack}' has zero providerCounts.`);
    }
  });
  if (sumProviders(providerTotals) <= 0) {
    failures.push('All providerCounts are zero.');
  }

  await closePool();

  if (failures.length) {
    failures.forEach((message) => console.error(`[verify-seed-health] ${message}`));
    process.exit(1);
  }

  console.log('[verify-seed-health] Passed.');
};

main().catch(async (error) => {
  console.error('[verify-seed-health] Failed:', error);
  await closePool();
  process.exit(1);
});
