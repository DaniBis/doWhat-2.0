#!/usr/bin/env node
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;

const pickEnv = (...keys) => {
  for (const key of keys) {
    const raw = process.env[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return undefined;
};

const parseArgs = (argv) => {
  const flags = new Set();
  const values = new Map();

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;

    if (token.startsWith('--')) {
      const [name, inlineValue] = token.split('=', 2);
      if (inlineValue !== undefined) {
        values.set(name, inlineValue);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        values.set(name, argv[i + 1]);
        i += 1;
      } else {
        flags.add(name);
      }
    }
  }

  return { flags, values };
};

const REQUIRED_CORE_MIGRATIONS = [
  '025_places_foursquare_metadata.sql',
  '026_activity_catalog.sql',
  '027_sessions_attendance.sql',
  '028_sessions_schema_spec.sql',
  '029_remove_rsvps_table.sql',
  '030_attendance_views.sql',
  '031_user_saved_activities.sql',
  '032_trait_policy_guard_fix.sql',
  '033_remove_event_participants.sql',
  '034_admin_audit_logs.sql',
];

const REQUIRED_DOWHAT_MIGRATIONS = [
  '034a_extend_attendance_status.sql',
  '035_dowhat_core.sql',
  '036_attendance_reliability_trigger.sql',
  '037_reliability_pledge_ack.sql',
  '038_dowhat_adoption_metrics.sql',
  '039_notification_outbox.sql',
  '043_dowhat_adoption_metrics.sql',
];

const step = async (label, fn) => {
  process.stdout.write(`- ${label}... `);
  try {
    await fn();
    console.log('ok');
  } catch (error) {
    console.log('FAIL');
    throw error;
  }
};

const main = async () => {
  const { flags, values } = parseArgs(process.argv);
  const requireDowhat = flags.has('--dowhat') || flags.has('--require-dowhat');
  const strict = flags.has('--strict');

  const schemaMigrationsTable = values.get('--table') || 'public.schema_migrations';

  const skipFlag = (process.env.MIGRATIONS_HEALTH_SKIP ?? '').toLowerCase();
  if (['1', 'true', 'yes'].includes(skipFlag)) {
    console.log('[migrations-health] Skipping required migration checks (MIGRATIONS_HEALTH_SKIP set).');
    process.exit(0);
  }

  const databaseUrl = pickEnv('SUPABASE_DB_URL', 'DATABASE_URL');
  if (!databaseUrl) {
    console.error('[migrations-health] Missing SUPABASE_DB_URL or DATABASE_URL. Provide one or set MIGRATIONS_HEALTH_SKIP=1 to bypass intentionally.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const requiredMigrations = requireDowhat
      ? [...REQUIRED_CORE_MIGRATIONS, ...REQUIRED_DOWHAT_MIGRATIONS]
      : REQUIRED_CORE_MIGRATIONS;

    const requiredSet = new Set(requiredMigrations);

    await step(`schema migrations table exists (${schemaMigrationsTable})`, async () => {
      const [schema, table] = schemaMigrationsTable.includes('.')
        ? schemaMigrationsTable.split('.', 2)
        : ['public', schemaMigrationsTable];
      const { rows } = await client.query(
        `select 1 from information_schema.tables where table_schema=$1 and table_name=$2 limit 1`,
        [schema, table],
      );
      if (!rows.length) throw new Error(`Missing table ${schema}.${table}`);
    });

    const applied = new Set();
    await step('load applied migrations', async () => {
      const result = await client.query(`select filename from ${schemaMigrationsTable}`);
      result.rows.forEach((row) => {
        if (row?.filename) applied.add(String(row.filename));
      });
    });

    const isApplied = (name) => applied.has(name);

    const missing = requiredMigrations.filter((name) => !isApplied(name));

    if (missing.length) {
      console.error('[migrations-health] Missing required migrations:');
      missing.forEach((name) => console.error(` - ${name}`));
      if (strict) {
        throw new Error('Missing required migrations');
      }
      process.exitCode = 1;
    }

    if (requireDowhat) {
      await step('doWhat tables exist', async () => {
        const { rows } = await client.query(
          `select table_name from information_schema.tables where table_schema='public' and table_name in ('user_sport_profiles','session_open_slots')`,
        );
        const found = new Set(rows.map((r) => String(r.table_name)));
        const expected = ['user_sport_profiles', 'session_open_slots'];
        const missingTables = expected.filter((t) => !found.has(t));
        if (missingTables.length) throw new Error(`Missing tables: ${missingTables.join(', ')}`);
      });

      await step('Notification outbox table exists', async () => {
        const { rows } = await client.query(
          `select 1 from information_schema.tables where table_schema='public' and table_name='notification_outbox' limit 1`,
        );
        if (!rows.length) throw new Error('Missing table notification_outbox');
      });
    }

    if (!missing.length) {
      console.log(`[migrations-health] OK (${requiredSet.size} required migrations present)`);
    }
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error('[migrations-health] Fatal error', error?.message ?? error);
  process.exitCode = 1;
});
