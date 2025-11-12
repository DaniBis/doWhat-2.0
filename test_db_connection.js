#!/usr/bin/env node
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { Client } = require('pg');

const ENV_FILE = '.env.local';

const parseEnvFile = (filePath) => {
  const absolute = resolve(filePath);
  if (!existsSync(absolute)) {
    return new Map();
  }
  const values = new Map();
  const content = readFileSync(absolute, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z0-9_\.\-]+)\s*=\s*(.*)$/);
    if (!match) return;
    const key = match[1];
    let value = match[2] ?? '';
    value = value.replace(/^['\"]|['\"]$/g, '');
    values.set(key, value);
  });
  return values;
};

const envValues = parseEnvFile(ENV_FILE);

const describeConnection = (connectionString) => {
  try {
    const url = new URL(connectionString);
    return {
      host: url.hostname,
      port: url.port || undefined,
      database: url.pathname?.replace(/^\//, '') || undefined,
      user: url.username || undefined,
    };
  } catch (error) {
    return { error: error.message };
  }
};

const pickConnectionString = () => {
  return (
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    envValues.get('SUPABASE_DB_URL') ||
    envValues.get('DATABASE_URL') ||
    null
  );
};

const redact = (value = '') => {
  if (!value) return 'n/a';
  return value.replace(/:[^:@]+@/, ':***@');
};

async function main() {
  const connectionString = pickConnectionString();
  if (!connectionString) {
    console.error('Missing SUPABASE_DB_URL or DATABASE_URL in environment or .env.local');
    process.exitCode = 1;
    return;
  }
  const connectionDetails = describeConnection(connectionString);

  const sslNeeded = /\.supabase\.co|\.supabase\.in|\.render\.com/.test(connectionString);
  const client = new Client({
    connectionString,
    ssl: sslNeeded ? { rejectUnauthorized: false } : undefined,
  });

  const start = Date.now();
  try {
    await client.connect();
    const { rows } = await client.query('select now() as current_time');
    const duration = Date.now() - start;
    const params = client.connectionParameters || {};
    console.log(
      'DB connection OK',
      JSON.stringify(
        {
          ...connectionDetails,
          host: params.host ?? connectionDetails.host,
          database: params.database ?? connectionDetails.database,
          user: params.user ?? connectionDetails.user,
          ssl: sslNeeded,
          latencyMs: duration,
          currentTime: rows?.[0]?.current_time,
          connectionString: redact(connectionString),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const safeError =
      error && typeof error === 'object'
        ? {
            name: error.name,
            code: error.code,
            message: error.message,
          }
        : { message: String(error) };
    console.error(
      'DB connection failed:',
      JSON.stringify(
        {
          ...safeError,
          details: connectionDetails,
          connectionString: redact(connectionString),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main();
