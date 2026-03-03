#!/usr/bin/env node
import process from 'node:process';
import pg from 'pg';
import loadEnv from './utils/load-env.mjs';

loadEnv(['.env.local', 'apps/doWhat-web/.env.local', 'apps/doWhat-mobile/.env.local']);

const { Pool } = pg;

const pickEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const databaseUrl = pickEnv('DATABASE_URL', 'SUPABASE_DB_URL');
if (!databaseUrl) {
  console.error('[cleanup:fake-location-data] Missing DATABASE_URL (or SUPABASE_DB_URL).');
  process.exit(1);
}

const needsSsl = !/localhost|127\.0\.0\.1/i.test(databaseUrl);
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: 2,
  idleTimeoutMillis: 5000,
});

const BAD_NAME_REGEX = "^(activity|activities|anywhere|everywhere|nearby\\s*place|nearby\\s*venue|n\\/?a|none|null|placeholder|sample|test|unknown|unnamed|venue|place)$";
const APPLY = process.env.APPLY === '1';

const diagnosticsSql = `
WITH suspicious_places AS (
  SELECT id, name, 'places'::text AS source
  FROM places
  WHERE name IS NULL OR btrim(name) = '' OR lower(btrim(name)) ~ $1
),
suspicious_venues AS (
  SELECT id, name, 'venues'::text AS source
  FROM venues
  WHERE name IS NULL OR btrim(name) = '' OR lower(btrim(name)) ~ $1
),
suspicious_activities AS (
  SELECT id, name, 'activities'::text AS source
  FROM activities
  WHERE name IS NULL OR btrim(name) = '' OR lower(btrim(name)) ~ $1
)
SELECT source, COUNT(*)::int AS count
FROM (
  SELECT * FROM suspicious_places
  UNION ALL
  SELECT * FROM suspicious_venues
  UNION ALL
  SELECT * FROM suspicious_activities
) t
GROUP BY source
ORDER BY source;
`;

const sampleSql = `
SELECT source, id, name
FROM (
  SELECT 'places'::text AS source, id, name
  FROM places
  WHERE name IS NULL OR btrim(name) = '' OR lower(btrim(name)) ~ $1
  UNION ALL
  SELECT 'venues'::text AS source, id, name
  FROM venues
  WHERE name IS NULL OR btrim(name) = '' OR lower(btrim(name)) ~ $1
  UNION ALL
  SELECT 'activities'::text AS source, id, name
  FROM activities
  WHERE name IS NULL OR btrim(name) = '' OR lower(btrim(name)) ~ $1
) x
ORDER BY source, name NULLS FIRST
LIMIT 50;
`;

const deleteSql = `
WITH deleted_places AS (
  DELETE FROM places p
  WHERE (p.name IS NULL OR btrim(p.name) = '' OR lower(btrim(p.name)) ~ $1)
    AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.place_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM events e WHERE e.place_id = p.id)
  RETURNING id
),
deleted_venues AS (
  DELETE FROM venues v
  WHERE (v.name IS NULL OR btrim(v.name) = '' OR lower(btrim(v.name)) ~ $1)
    AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.venue_id = v.id)
  RETURNING id
),
deleted_activities AS (
  DELETE FROM activities a
  WHERE (a.name IS NULL OR btrim(a.name) = '' OR lower(btrim(a.name)) ~ $1)
    AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.activity_id = a.id)
  RETURNING id
)
SELECT
  (SELECT COUNT(*)::int FROM deleted_places) AS places_deleted,
  (SELECT COUNT(*)::int FROM deleted_venues) AS venues_deleted,
  (SELECT COUNT(*)::int FROM deleted_activities) AS activities_deleted;
`;

const closePool = async () => {
  try {
    await pool.end();
  } catch (error) {
    console.warn('[cleanup:fake-location-data] Failed to close DB pool', error);
  }
};

const main = async () => {
  console.info(`[cleanup:fake-location-data] Running ${APPLY ? 'APPLY' : 'DRY RUN'} mode`);
  console.info(`[cleanup:fake-location-data] Suspicious name regex: ${BAD_NAME_REGEX}`);

  const diagnostics = await pool.query(diagnosticsSql, [BAD_NAME_REGEX]);
  const summary = diagnostics.rows.map((row) => ({ source: row.source, count: Number(row.count ?? 0) }));
  console.table(summary);

  const samples = await pool.query(sampleSql, [BAD_NAME_REGEX]);
  if (samples.rows.length > 0) {
    console.info('\n[cleanup:fake-location-data] Sample suspicious rows');
    console.table(samples.rows);
  } else {
    console.info('\n[cleanup:fake-location-data] No suspicious rows found.');
  }

  if (!APPLY) {
    console.info('\n[cleanup:fake-location-data] Dry run complete. Set APPLY=1 to execute deletions.');
    return;
  }

  const deleted = await pool.query(deleteSql, [BAD_NAME_REGEX]);
  const row = deleted.rows[0] ?? {};
  console.info('\n[cleanup:fake-location-data] Deletion summary');
  console.table([
    {
      places_deleted: Number(row.places_deleted ?? 0),
      venues_deleted: Number(row.venues_deleted ?? 0),
      activities_deleted: Number(row.activities_deleted ?? 0),
    },
  ]);
};

main()
  .catch(async (error) => {
    console.error('[cleanup:fake-location-data] Failed:', error?.message ?? error);
    await closePool();
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
