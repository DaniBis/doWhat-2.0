#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import process from 'node:process';
import pg from 'pg';
import loadEnv from './utils/load-env.mjs';

const { Client } = pg;

loadEnv();

const resolveDatabaseUrl = () => {
  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Set SUPABASE_DB_URL or DATABASE_URL before running this script.');
  }
  if (url.includes('[YOUR-PASSWORD]')) {
    throw new Error('Database URL still contains [YOUR-PASSWORD] placeholder.');
  }
  return url;
};

const MIGRATIONS = [
  resolve(process.cwd(), 'apps/doWhat-web/supabase/migrations/061_security_advisor_hardening.sql'),
  resolve(process.cwd(), 'apps/doWhat-web/supabase/migrations/062_security_advisor_search_path_hardening.sql'),
  resolve(process.cwd(), 'apps/doWhat-web/supabase/migrations/063_security_advisor_view_invoker_followup.sql'),
  resolve(process.cwd(), 'apps/doWhat-web/supabase/migrations/064_security_advisor_extension_schema_cleanup.sql'),
];

const SCHEMA_MIGRATIONS_TABLE = 'public.schema_migrations';

const ensureMigrationsTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const migrationAlreadyApplied = async (client, filename) => {
  const result = await client.query(
    `SELECT 1 FROM ${SCHEMA_MIGRATIONS_TABLE} WHERE filename = $1 LIMIT 1`,
    [filename],
  );
  return result.rowCount > 0;
};

const applyMigration = async (client, filePath) => {
  const filename = basename(filePath);
  const alreadyApplied = await migrationAlreadyApplied(client, filename);
  if (alreadyApplied) {
    console.log(`[advisor-fix] skipping ${filename} (already applied)`);
    return;
  }

  const sql = await readFile(filePath, 'utf8');
  console.log(`[advisor-fix] applying ${filename}`);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(`INSERT INTO ${SCHEMA_MIGRATIONS_TABLE} (filename) VALUES ($1)`, [filename]);
    await client.query('COMMIT');
    console.log(`[advisor-fix] applied ${filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};

const querySecuritySummary = async (client) => {
  const mutableFunctions = await client.query(`
    SELECT count(*)::int AS total
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  `);

  const targetViews = await client.query(
    `
      SELECT
        c.relname AS view_name,
        COALESCE(
          EXISTS (
            SELECT 1
            FROM unnest(coalesce(c.reloptions, ARRAY[]::text[])) AS opt
            WHERE opt = 'security_invoker=true'
          ),
          FALSE
        ) AS security_invoker_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'v'
        AND c.relname = ANY ($1::text[])
      ORDER BY c.relname
    `,
    [[
      'v_venue_activity_votes',
      'v_venue_activity_scores',
      'dowhat_adoption_metrics',
      'social_sweat_adoption_metrics',
      'social_sweet_adoption_metrics',
    ]],
  );

  const extensionSchemas = await client.query(
    `
      SELECT
        e.extname AS extension_name,
        n.nspname AS schema_name,
        e.extrelocatable AS relocatable
      FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace
      WHERE e.extname = ANY ($1::text[])
      ORDER BY e.extname
    `,
    [[
      'vector',
      'cube',
      'earthdistance',
      'pg_net',
      'postgis',
    ]],
  );

  const spatialRls = await client.query(`
    SELECT
      COALESCE(c.relrowsecurity, FALSE) AS rls_enabled,
      EXISTS (
        SELECT 1
        FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = 'spatial_ref_sys'
          AND p.policyname = 'spatial_ref_sys_read_only'
      ) AS read_policy_present
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'spatial_ref_sys'
      AND c.relkind = 'r'
  `);

  return {
    mutableFunctionCount: mutableFunctions.rows[0]?.total ?? null,
    viewSecurity: targetViews.rows,
    spatialRefSys: spatialRls.rows[0] ?? null,
    extensions: extensionSchemas.rows,
  };
};

const main = async () => {
  const databaseUrl = resolveDatabaseUrl();
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    await ensureMigrationsTable(client);
    for (const migration of MIGRATIONS) {
      await applyMigration(client, migration);
    }

    const summary = await querySecuritySummary(client);
    console.log('[advisor-fix] verification summary:');
    console.log(JSON.stringify(summary, null, 2));

    if (summary.mutableFunctionCount && summary.mutableFunctionCount > 0) {
      console.warn(
        `[advisor-fix] ${summary.mutableFunctionCount} public functions still have mutable search_path.`,
      );
    }

    const insecureViews = (summary.viewSecurity || []).filter((view) => view.security_invoker_enabled === false);
    if (insecureViews.length) {
      console.warn('[advisor-fix] views still missing security_invoker=true:');
      for (const view of insecureViews) {
        console.warn(`- ${view.view_name}`);
      }
    }

    const publicExtensions = (summary.extensions || []).filter((ext) => ext.schema_name === 'public');
    if (publicExtensions.length) {
      console.warn('[advisor-fix] extensions still installed in public schema:');
      for (const ext of publicExtensions) {
        console.warn(`- ${ext.extension_name}`);
      }
    }
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error('[advisor-fix] failed:', error.message || error);
  process.exitCode = 1;
});
