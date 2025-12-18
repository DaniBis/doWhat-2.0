#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
/*
 * Simple migration runner that replays every SQL file inside
 * apps/doWhat-web/supabase/migrations against the configured database.
 *
 * Usage:
 *   SUPABASE_DB_URL=postgres://... node run_migrations.js
 *   # or
 *   DATABASE_URL=postgres://... node run_migrations.js
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const process = require('node:process');
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, 'apps', 'doWhat-web', 'supabase', 'migrations');
const TABLE_NAME = 'public.schema_migrations';
const MIGRATION_ALIASES = new Map([
  ['035_dowhat_core.sql', ['035_social_sweat_core.sql']],
  ['038_dowhat_adoption_metrics.sql', ['038_social_sweat_adoption_metrics.sql']],
]);

const resolveDatabaseUrl = () => {
  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('[migrate] Set SUPABASE_DB_URL or DATABASE_URL to run migrations.');
    process.exit(1);
  }
  return url;
};

const ensureSchemaTable = async (client) => {
  await client.query(`
    create table if not exists ${TABLE_NAME} (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);
};

const readMigrations = async () => {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
};

const hasMigrationRun = async (client, filename) => {
  const candidates = [filename, ...(MIGRATION_ALIASES.get(filename) ?? [])];
  const result = await client.query(`select 1 from ${TABLE_NAME} where filename = any($1::text[]) limit 1`, [candidates]);
  return result.rowCount > 0;
};

const applyMigration = async (client, filename) => {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const sql = await fs.readFile(filePath, 'utf8');
  console.info(`[migrate] Applying ${filename}`);
  await client.query('begin');
  try {
    await client.query(sql);
    await client.query(`insert into ${TABLE_NAME} (filename) values ($1)`, [filename]);
    await client.query('commit');
    console.info(`[migrate] Applied ${filename}`);
  } catch (error) {
    await client.query('rollback');
    console.error(`[migrate] Failed ${filename}`);
    console.error(error);
    throw error;
  }
};

(async () => {
  const databaseUrl = resolveDatabaseUrl();
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await ensureSchemaTable(client);
    const migrations = await readMigrations();
    if (!migrations.length) {
      console.info('[migrate] No migrations found.');
      return;
    }

    for (const filename of migrations) {
      const alreadyRan = await hasMigrationRun(client, filename);
      if (alreadyRan) {
        console.info(`[migrate] Skipping ${filename} (already applied)`);
        continue;
      }
      await applyMigration(client, filename);
    }

    console.info('[migrate] All migrations applied.');
  } catch (error) {
    console.error('[migrate] Fatal error', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
