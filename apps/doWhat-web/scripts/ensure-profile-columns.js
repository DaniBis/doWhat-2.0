#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */
const { Pool } = require('pg');

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Missing SUPABASE_DB_URL or DATABASE_URL environment variable.');
  process.exit(1);
}

async function ensureProfileColumns() {
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
  });
  try {
    await pool.query(`
      ALTER TABLE profiles
        ADD COLUMN IF NOT EXISTS bio text,
        ADD COLUMN IF NOT EXISTS location text,
        ADD COLUMN IF NOT EXISTS instagram text,
        ADD COLUMN IF NOT EXISTS whatsapp text;
    `);
    console.log('Ensured profiles table contains bio/location/instagram/whatsapp columns.');
  } finally {
    await pool.end();
  }
}

ensureProfileColumns().catch((err) => {
  console.error('Failed to ensure profile columns', err);
  process.exit(1);
});
