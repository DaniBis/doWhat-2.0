#!/usr/bin/env node
import process from 'node:process';
import pg from 'pg';
import loadEnv from './utils/load-env.mjs';

const { Client } = pg;

loadEnv();

const NETWORK_ERROR_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH']);

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

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    if (token.startsWith('--')) {
      const [name, inlineValue] = token.split('=', 2);
      if (inlineValue !== undefined) {
        values.set(name, inlineValue);
      } else if (index + 1 < argv.length && !argv[index + 1].startsWith('--')) {
        values.set(name, argv[index + 1]);
        index += 1;
      } else {
        flags.add(name);
      }
    }
  }

  return { flags, values };
};

const REQUIRED_CORE_MIGRATIONS = [
  { name: '025_places_foursquare_metadata.sql' },
  { name: '026_activity_catalog.sql' },
  { name: '027_sessions_attendance.sql' },
  { name: '028_sessions_schema_spec.sql' },
  { name: '029_remove_rsvps_table.sql' },
  { name: '030_attendance_views.sql' },
  { name: '031_user_saved_activities.sql' },
  { name: '032_trait_policy_guard_fix.sql' },
  { name: '033_remove_event_participants.sql' },
  { name: '034_admin_audit_logs.sql' },
];

const REQUIRED_DOWHAT_MIGRATIONS = [
  { name: '034a_extend_attendance_status.sql' },
  { name: '035_dowhat_core.sql' },
  { name: '036_attendance_reliability_trigger.sql' },
  { name: '037_reliability_pledge_ack.sql' },
  { name: '038_dowhat_adoption_metrics.sql' },
  { name: '039_notification_outbox.sql' },
  { name: '043_dowhat_adoption_metrics.sql' },
  {
    name: '045_places_canonical_enforcement.sql',
    why: 'canonical place linkage for activities/events must exist before discovery place truth is reliable',
  },
  {
    name: '046_events_event_state.sql',
    why: 'event state / verification fields are required for stable event payload semantics',
  },
  {
    name: '047_venues_updated_timestamp.sql',
    why: 'venue recency tracking is part of the mixed legacy discovery compatibility path',
  },
  {
    name: '048_map_places_alignment.sql',
    why: 'activities, sessions, and events need aligned place_id/place_label linkage for map discovery correctness',
  },
  {
    name: '049_activities_nearby_place_metadata.sql',
    why: 'activities_nearby must expose canonical place metadata used by the discovery engine',
  },
  {
    name: '050_activities_legacy_column_sync.sql',
    why: 'legacy activity columns still need to stay in sync while compatibility paths exist',
  },
  {
    name: '051_event_and_session_reliability_columns.sql',
    why: 'reliability metadata supports event/session trust semantics used in discovery surfaces',
  },
  {
    name: '052_activities_place_label_cleanup.sql',
    why: 'activities_nearby and map payloads depend on canonical place labels instead of legacy activity labels',
  },
  {
    name: '060_sessions_place_label_finalize.sql',
    why: 'session place_label integrity is required for event/session hydration and discovery place display',
  },
  {
    name: '065_discovery_exposures.sql',
    why: 'discovery exposure telemetry is part of the hardened discovery measurement path',
  },
  {
    name: '066_place_tiles_discovery_cache.sql',
    why: 'tile-level discovery cache storage is part of the moderate discovery performance baseline',
  },
  {
    name: '067_activity_catalog_city_keyword_pack.sql',
    why: 'city keyword packs improve activity matching consistency in discovery',
  },
  {
    name: '068_discovery_query_support_indexes.sql',
    why: 'discovery query support indexes are the current SQL hardening baseline for hot paths',
  },
];

const REQUIRED_PUBLIC_TABLES = ['user_sport_profiles', 'session_open_slots', 'notification_outbox'];
const DISCOVERY_BASELINE_MIGRATIONS = [
  '060_sessions_place_label_finalize.sql',
  '065_discovery_exposures.sql',
  '066_place_tiles_discovery_cache.sql',
  '067_activity_catalog_city_keyword_pack.sql',
  '068_discovery_query_support_indexes.sql',
];

const shouldFallbackToRest = (error) => {
  const code = typeof error?.code === 'string' ? error.code : null;
  if (code && NETWORK_ERROR_CODES.has(code)) return true;
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  return message.includes('getaddrinfo') || message.includes('network') || message.includes('timed out');
};

const parseSchemaTable = (value) =>
  value.includes('.')
    ? { schema: value.split('.', 2)[0], table: value.split('.', 2)[1] }
    : { schema: 'public', table: value };

const buildRestHeaders = (serviceRoleKey) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  Accept: 'application/json',
});

const parseResponseText = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const loadAppliedFromPg = async (client, schemaMigrationsTable) => {
  const result = await client.query(`select filename from ${schemaMigrationsTable} order by filename asc`);
  return result.rows
    .map((row) => String(row.filename))
    .filter(Boolean);
};

const ensureSchemaTableExistsFromPg = async (client, schemaMigrationsTable) => {
  const { schema, table } = parseSchemaTable(schemaMigrationsTable);
  const { rows } = await client.query(
    `select 1 from information_schema.tables where table_schema=$1 and table_name=$2 limit 1`,
    [schema, table],
  );
  return rows.length > 0;
};

const checkPublicTablesFromPg = async (client) => {
  const { rows } = await client.query(
    `select table_name from information_schema.tables where table_schema='public' and table_name = any($1::text[]) order by table_name asc`,
    [REQUIRED_PUBLIC_TABLES],
  );
  const found = new Set(rows.map((row) => String(row.table_name)));
  return REQUIRED_PUBLIC_TABLES.map((table) => ({ table, ok: found.has(table), detail: found.has(table) ? 'present' : 'missing' }));
};

const loadAppliedFromRest = async (supabaseUrl, serviceRoleKey, schemaMigrationsTable) => {
  const { table } = parseSchemaTable(schemaMigrationsTable);
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  url.searchParams.set('select', 'filename,applied_at');
  url.searchParams.set('order', 'filename.asc');
  url.searchParams.set('limit', '1000');
  const response = await fetch(url, { headers: buildRestHeaders(serviceRoleKey) });
  const body = await parseResponseText(response);
  if (!response.ok) {
    throw new Error(`REST migration lookup failed (${response.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return Array.isArray(body)
    ? body
        .map((row) => String(row.filename))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
    : [];
};

const restTableRequest = async (supabaseUrl, serviceRoleKey, table) => {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  url.searchParams.set('select', '*');
  url.searchParams.set('limit', '1');
  const response = await fetch(url, { headers: buildRestHeaders(serviceRoleKey) });
  const body = await parseResponseText(response);
  if (response.ok) {
    return { table, ok: true, detail: 'present' };
  }
  const detail = typeof body === 'string' ? body : JSON.stringify(body);
  const normalized = detail.toLowerCase();
  if (normalized.includes('relation') && normalized.includes('does not exist')) {
    return { table, ok: false, detail: 'missing' };
  }
  return { table, ok: false, detail: `unexpected response ${response.status}` };
};

const checkPublicTablesFromRest = async (supabaseUrl, serviceRoleKey) =>
  Promise.all(REQUIRED_PUBLIC_TABLES.map((table) => restTableRequest(supabaseUrl, serviceRoleKey, table)));

const buildMissingEntries = (requiredMigrations, appliedSet) =>
  requiredMigrations
    .filter((migration) => !appliedSet.has(migration.name))
    .map((migration) => ({ name: migration.name, why: migration.why ?? null }));

const printHumanReport = (report) => {
  const lines = [
    `[migrations-health] Status: ${report.status}`,
    `[migrations-health] Mode: ${report.mode}`,
    `[migrations-health] Schema migrations table: ${report.schemaMigrationsTable}`,
    `[migrations-health] Required migrations: ${report.requiredCount}`,
    `[migrations-health] Applied required migrations: ${report.appliedRequiredCount}`,
    `[migrations-health] Missing required migrations: ${report.missing.length}`,
  ];
  if (report.warnings.length) {
    report.warnings.forEach((warning) => lines.push(`[migrations-health] Warning: ${warning}`));
  }

  if (report.missing.length > 0) {
    lines.push('[migrations-health] Missing required migrations:');
    report.missing.forEach((entry) => {
      const suffix = entry.why ? ` — ${entry.why}` : '';
      lines.push(` - ${entry.name}${suffix}`);
    });
  }

  if (report.missingDiscovery.length > 0) {
    lines.push('[migrations-health] Discovery rollout blocked by missing discovery-critical migrations:');
    report.missingDiscovery.forEach((entry) => {
      const suffix = entry.why ? ` — ${entry.why}` : '';
      lines.push(` - ${entry.name}${suffix}`);
    });
  }

  if (report.tableChecks.length) {
    lines.push('[migrations-health] Required public tables:');
    report.tableChecks.forEach((check) => {
      lines.push(` - ${check.table}: ${check.ok ? 'present' : 'missing'}${check.detail && check.detail !== 'present' && check.detail !== 'missing' ? ` (${check.detail})` : ''}`);
    });
  }

  if (report.nextActions.length > 0) {
    lines.push('[migrations-health] Next actions:');
    report.nextActions.forEach((action) => {
      lines.push(` - ${action}`);
    });
  }

  if (report.missing.length === 0 && report.tableChecks.every((check) => check.ok)) {
    lines.push('[migrations-health] OK');
  }

  process.stdout.write(`${lines.join('\n')}\n`);
};

const main = async () => {
  const { flags, values } = parseArgs(process.argv);
  const requireDowhat = flags.has('--dowhat') || flags.has('--require-dowhat');
  const strict = flags.has('--strict');
  const json = flags.has('--json');
  const forceRemoteRest = flags.has('--remote-rest') || flags.has('--rest');
  const schemaMigrationsTable = values.get('--table') || 'public.schema_migrations';

  const skipFlag = (process.env.MIGRATIONS_HEALTH_SKIP ?? '').toLowerCase();
  if (['1', 'true', 'yes'].includes(skipFlag)) {
    console.log('[migrations-health] Skipping required migration checks (MIGRATIONS_HEALTH_SKIP set).');
    process.exit(0);
  }

  const requiredMigrations = requireDowhat
    ? [...REQUIRED_CORE_MIGRATIONS, ...REQUIRED_DOWHAT_MIGRATIONS]
    : REQUIRED_CORE_MIGRATIONS;
  const requiredNames = requiredMigrations.map((migration) => migration.name);

  const databaseUrl = pickEnv('SUPABASE_DB_URL', 'DATABASE_URL');
  const supabaseUrl = pickEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = pickEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY');

  let mode = 'pg';
  const warnings = [];
  let appliedNames = [];
  let tableChecks = [];

  if (!forceRemoteRest && databaseUrl) {
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      const schemaExists = await ensureSchemaTableExistsFromPg(client, schemaMigrationsTable);
      if (!schemaExists) {
        throw new Error(`Missing table ${schemaMigrationsTable}`);
      }
      appliedNames = await loadAppliedFromPg(client, schemaMigrationsTable);
      if (requireDowhat) {
        tableChecks = await checkPublicTablesFromPg(client);
      }
    } catch (error) {
      await client.end().catch(() => {});
      if (!supabaseUrl || !serviceRoleKey || !shouldFallbackToRest(error)) {
        throw error;
      }
      mode = 'rest';
      warnings.push(`Fell back to REST mode because direct PostgreSQL connectivity failed: ${error.message ?? error}`);
    } finally {
      if (mode === 'pg') {
        await client.end().catch(() => {});
      }
    }
  } else {
    mode = 'rest';
  }

  if (mode === 'rest') {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('REST mode requires SUPABASE_URL (or public variant) plus SUPABASE_SERVICE_ROLE_KEY.');
    }
    appliedNames = await loadAppliedFromRest(supabaseUrl, serviceRoleKey, schemaMigrationsTable);
    if (requireDowhat) {
      tableChecks = await checkPublicTablesFromRest(supabaseUrl, serviceRoleKey);
    }
  }

  const appliedSet = new Set(appliedNames);
  const missing = buildMissingEntries(requiredMigrations, appliedSet);
  const missingTableChecks = tableChecks.filter((check) => !check.ok);
  const discoverySet = new Set(DISCOVERY_BASELINE_MIGRATIONS);
  const missingDiscovery = missing.filter((entry) => discoverySet.has(entry.name));
  const nextActions = [];

  if (missingDiscovery.length > 0) {
    nextActions.push('From a DB-connected machine, run `pnpm db:migrate` so the missing discovery migrations apply in filename order.');
    nextActions.push('Re-run `node scripts/health-migrations.mjs --dowhat --strict` from a machine with direct PostgreSQL connectivity.');
    nextActions.push('Re-run `node scripts/health-migrations.mjs --dowhat --remote-rest --strict` to confirm the REST-visible project state matches the repo baseline.');
    nextActions.push('After both health checks pass, run `node scripts/verify-discovery-sql-contract.mjs`, `node scripts/verify-discovery-rollout-pack.mjs`, and the SQL pack in `scripts/sql/discovery-postdeploy-checks.sql`.');
  } else if (missingTableChecks.length > 0) {
    nextActions.push('Inspect the missing public tables and confirm the corresponding migrations ran successfully before proceeding with discovery verification.');
  } else if (requireDowhat) {
    nextActions.push('Run the remote post-deploy SQL pack in `scripts/sql/discovery-postdeploy-checks.sql` and capture the results in the rollout task.');
  }

  const report = {
    status: missing.length > 0 || missingTableChecks.length > 0 ? 'blocked' : 'ok',
    mode,
    schemaMigrationsTable,
    requiredCount: requiredNames.length,
    appliedRequiredCount: requiredNames.length - missing.length,
    missing,
    missingDiscovery,
    tableChecks,
    missingTableChecks,
    discoveryBaselineReady: missingDiscovery.length === 0,
    warnings,
    nextActions,
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  if (missing.length > 0 || missingTableChecks.length > 0) {
    if (strict) {
      throw new Error('Missing required migrations or tables');
    }
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error('[migrations-health] Fatal error', error?.message ?? error);
  process.exitCode = 1;
});
