let ensurePromise: Promise<void> | null = null;

type QueryablePool = {
  query: (queryText: string) => Promise<unknown>;
  end: () => Promise<void>;
};

function getConnectionString(): string | null {
  return process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || null;
}

async function migrateProfiles(pool: QueryablePool) {
  await pool.query(`
    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS bio text,
      ADD COLUMN IF NOT EXISTS location text,
      ADD COLUMN IF NOT EXISTS instagram text,
      ADD COLUMN IF NOT EXISTS whatsapp text;
  `);
}

async function runEnsure(): Promise<void> {
  const connectionString = getConnectionString();
  if (!connectionString) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('ensureProfileColumns: skipped (no SUPABASE_DB_URL / DATABASE_URL env).');
    }
    return;
  }
  const pgModule = await import('pg');
  const { Pool } = 'default' in pgModule ? pgModule.default : pgModule;
  const pool: QueryablePool = new Pool({
    connectionString,
    ssl: connectionString.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
  });
  try {
    await migrateProfiles(pool);
  } finally {
    await pool.end();
  }
}

export async function ensureProfileColumns(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = runEnsure().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}
