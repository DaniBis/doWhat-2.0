let ensurePromise: Promise<void> | null = null;

type QueryablePool = {
  query: (queryText: string) => Promise<unknown>;
  end: () => Promise<void>;
};

const NON_FATAL_CONNECTION_ERROR_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENETUNREACH',
]);

export const isNonFatalConnectionError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const withCode = error as Error & { code?: string; cause?: unknown };
  const code = typeof withCode.code === 'string' ? withCode.code.toUpperCase() : '';
  if (code && NON_FATAL_CONNECTION_ERROR_CODES.has(code)) return true;
  const message = error.message.toLowerCase();
  if (message.includes('getaddrinfo enotfound')) return true;
  if (message.includes('could not translate host name')) return true;
  if (withCode.cause) return isNonFatalConnectionError(withCode.cause);
  return false;
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
      ADD COLUMN IF NOT EXISTS whatsapp text,
      ADD COLUMN IF NOT EXISTS core_values text[] NOT NULL DEFAULT '{}'::text[];
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
  } catch (error) {
    if (isNonFatalConnectionError(error)) {
      console.warn('ensureProfileColumns: skipped due to database connectivity issue', error);
      return;
    }
    throw error;
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
