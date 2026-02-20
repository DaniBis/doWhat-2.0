#!/usr/bin/env node
import process from 'node:process';
import pg from 'pg';

import loadEnv from './utils/load-env.mjs';

const { Client } = pg;

loadEnv();

const pickEnv = (...keys) => {
  for (const key of keys) {
    const raw = process.env[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return undefined;
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  return rounded > 0 ? rounded : fallback;
};

const dryRun = process.argv.includes('--dry-run');
const retentionDays = parsePositiveInt(process.env.DISCOVERY_EXPOSURE_RETENTION_DAYS ?? '30', 30);

const databaseUrl = pickEnv('SUPABASE_DB_URL', 'DATABASE_URL');
if (!databaseUrl) {
  console.error('[discovery-exposures-cleanup] Missing SUPABASE_DB_URL or DATABASE_URL');
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });

const main = async () => {
  await client.connect();
  try {
    const countSql = `
      select count(*)::int as count
      from public.discovery_exposures
      where created_at < now() - ($1 || ' days')::interval
    `;

    const { rows } = await client.query(countSql, [retentionDays]);
    const staleCount = Number(rows?.[0]?.count ?? 0);

    console.log(`[discovery-exposures-cleanup] stale rows (${retentionDays}d): ${staleCount}`);

    if (dryRun || staleCount === 0) {
      console.log('[discovery-exposures-cleanup] no delete executed');
      return;
    }

    const deleteSql = `
      delete from public.discovery_exposures
      where created_at < now() - ($1 || ' days')::interval
    `;
    const result = await client.query(deleteSql, [retentionDays]);
    console.log(`[discovery-exposures-cleanup] deleted rows: ${result.rowCount ?? 0}`);
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error('[discovery-exposures-cleanup] Fatal error', error?.message ?? error);
  process.exitCode = 1;
});
