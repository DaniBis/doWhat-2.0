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

const formatCountRow = (rows) => rows?.[0]?.count ? Number(rows[0].count) : 0;

const pendingThresholdMinutes = Number(process.env.NOTIFICATION_PENDING_WARN_MINUTES ?? '15');
const failureWindowMinutes = Number(process.env.NOTIFICATION_FAILURE_WINDOW_MINUTES ?? '60');

const databaseUrl = pickEnv('SUPABASE_DB_URL', 'DATABASE_URL');
if (!databaseUrl) {
  console.log('[notification-health] Skipping: SUPABASE_DB_URL/DATABASE_URL not set.');
  process.exit(0);
}

const client = new Client({ connectionString: databaseUrl });

const step = async (label, fn) => {
  process.stdout.write(`- ${label}... `);
  try {
    const result = await fn();
    console.log('ok');
    return result;
  } catch (error) {
    console.log('FAIL');
    throw error;
  }
};

const main = async () => {
  await client.connect();
  try {
    await step('notification_outbox table present', async () => {
      const { rows } = await client.query(
        `select 1 from information_schema.tables where table_schema='public' and table_name='notification_outbox' limit 1`,
      );
      if (!rows.length) {
        throw new Error('notification_outbox table missing — ensure migration 039 is applied');
      }
    });

    const statusCounts = await step('load notification status counts', async () => {
      const { rows } = await client.query(
        `select status, count(*)::int as count
         from notification_outbox
         group by status
         order by status`,
      );
      return rows;
    });

    const stalePendingCount = await step('detect stale pending rows', async () => {
      const { rows } = await client.query(
        `select count(*)::int as count
         from notification_outbox
         where status = 'pending'
           and created_at < now() - ($1 || ' minutes')::interval`,
        [pendingThresholdMinutes],
      );
      return formatCountRow(rows);
    });

    const recentFailures = await step('detect recent failures', async () => {
      const { rows } = await client.query(
        `select count(*)::int as count
         from notification_outbox
         where status = 'failed'
           and updated_at > now() - ($1 || ' minutes')::interval`,
        [failureWindowMinutes],
      );
      return formatCountRow(rows);
    });

    console.log('\n[notification-health] status counts');
    if (!statusCounts.length) {
      console.log('  (no rows yet)');
    } else {
      statusCounts.forEach(({ status, count }) => {
        const label = (status ?? 'unknown').padEnd(8);
        console.log(`  ${label} ${String(count ?? 0).padStart(4)}`);
      });
    }

    let unhealthy = false;
    if (stalePendingCount > 0) {
      console.error(
        `[notification-health] ${stalePendingCount} pending row(s) older than ${pendingThresholdMinutes} minutes — cron may be stuck or Twilio is failing.`,
      );
      unhealthy = true;
    }

    if (recentFailures > 0) {
      console.error(
        `[notification-health] ${recentFailures} failed row(s) updated within the last ${failureWindowMinutes} minutes — inspect notification_outbox.last_error.`,
      );
      unhealthy = true;
    }

    if (unhealthy) {
      process.exitCode = 1;
    } else {
      console.log('[notification-health] OK');
    }
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error('[notification-health] Fatal error', error?.message ?? error);
  process.exitCode = 1;
});
