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
  console.error('[health:place-labels] Missing DATABASE_URL (or SUPABASE_DB_URL).');
  process.exit(1);
}

const needsSsl = !/localhost|127\.0\.0\.1/i.test(databaseUrl);
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: 2,
  idleTimeoutMillis: 5000,
});

const summarySql = `
  WITH normalized AS (
    SELECT
      id,
      place_label,
      place_id,
      venue_id,
      activity_id,
      TRIM(COALESCE(place_label, '')) AS trimmed_label
    FROM sessions
  )
  SELECT
    COUNT(*) AS total_sessions,
    COUNT(*) FILTER (WHERE place_label IS NULL) AS null_count,
    COUNT(*) FILTER (WHERE place_label IS NOT NULL AND trimmed_label = '') AS blank_count,
    COUNT(*) FILTER (WHERE place_label IS NULL OR trimmed_label = '') AS missing_total,
    COUNT(*) FILTER (WHERE place_label IS NULL AND place_id IS NOT NULL) AS null_with_place,
    COUNT(*) FILTER (WHERE place_label IS NULL AND venue_id IS NOT NULL) AS null_with_venue,
    COUNT(*) FILTER (WHERE place_label IS NULL AND activity_id IS NOT NULL) AS null_with_activity
  FROM normalized;
`;

const sampleSql = `
  SELECT
    s.id,
    s.activity_id,
    a.name AS activity_name,
    s.venue_id,
    v.name AS venue_name,
    s.place_id,
    s.place_label,
    s.updated_at
  FROM sessions s
  LEFT JOIN activities a ON a.id = s.activity_id
  LEFT JOIN venues v ON v.id = s.venue_id
  WHERE s.place_label IS NULL OR TRIM(COALESCE(s.place_label, '')) = ''
  ORDER BY s.updated_at DESC
  LIMIT 20;
`;

const constraintSql = `
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sessions'::regclass
      AND conname = 'sessions_place_label_nonempty'
  ) AS has_constraint;
`;

const columnSql = `
  SELECT
    column_name,
    is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'sessions'
    AND column_name = 'place_label'
  LIMIT 1;
`;

const toNumber = (value) => Number(value ?? 0);

const formatSummary = (row) => ({
  totalSessions: toNumber(row.total_sessions),
  nullCount: toNumber(row.null_count),
  blankCount: toNumber(row.blank_count),
  missingTotal: toNumber(row.missing_total),
  nullWithPlaceId: toNumber(row.null_with_place),
  nullWithVenueId: toNumber(row.null_with_venue),
  nullWithActivityId: toNumber(row.null_with_activity),
});

const normalizeSampleRow = (row) => ({
  id: row.id,
  activity: row.activity_name || row.activity_id || null,
  venue: row.venue_name || row.venue_id || null,
  place_id: row.place_id,
  place_label: row.place_label,
  updated_at: row.updated_at,
});

const closePool = async () => {
  try {
    await pool.end();
  } catch (error) {
    console.warn('[health:place-labels] Failed to close pool', error);
  }
};

const main = async () => {
  console.info('Checking sessions.place_label invariants...');
  const summaryResult = await pool.query(summarySql);
  const summaryRow = formatSummary(summaryResult.rows[0] ?? {});

  console.log('\nSession place label summary');
  console.table(summaryRow);

  const sampleResult = await pool.query(sampleSql);
  if (sampleResult.rows.length) {
    console.log('\nSample rows missing place_label');
    console.table(sampleResult.rows.map(normalizeSampleRow));
  } else {
    console.log('\nAll sessions have populated place labels.');
  }

  const constraintResult = await pool.query(constraintSql);
  const hasConstraint = Boolean(constraintResult.rows[0]?.has_constraint);

  const columnResult = await pool.query(columnSql);
  const columnNullable = (columnResult.rows[0]?.is_nullable ?? '').toUpperCase();
  const columnNotNull = columnNullable === 'NO';

  console.log('\nSession label guardrails');
  console.table([
    {
      constraint: 'sessions_place_label_nonempty',
      constraintPresent: hasConstraint ? 'present' : 'missing',
      columnNotNull: columnNotNull ? 'YES' : columnNullable || 'UNKNOWN',
    },
  ]);

  await closePool();

  const failures = [];
  if (summaryRow.missingTotal > 0) {
    failures.push(`[health:place-labels] Found ${summaryRow.missingTotal} session(s) missing place_label.`);
  }
  if (!columnNotNull) {
    failures.push('[health:place-labels] Column public.sessions.place_label is still nullable.');
  }
  if (!hasConstraint) {
    failures.push('[health:place-labels] Constraint sessions_place_label_nonempty is missing.');
  }

  if (failures.length) {
    failures.forEach((message) => console.error(`\n${message}`));
    console.error('\nFix the issues above and re-run this script.');
    process.exit(1);
  }

  console.info('\n[health:place-labels] All sessions have valid labels and structural guardrails.');
};

main().catch(async (error) => {
  console.error('\n[health:place-labels] Failed:', error);
  await closePool();
  process.exit(1);
});
