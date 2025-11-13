// Service-role Supabase client (bypasses RLS) for cron / backend jobs.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let attemptedInit = false;
let warnedMissing = false;

export function createServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  if (attemptedInit) {
    throw new Error('Missing SUPABASE service environment variables');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  attemptedInit = true;
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE service environment variables');
  }
  cachedClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return cachedClient;
}

export function getOptionalServiceClient(): SupabaseClient | null {
  try {
    return createServiceClient();
  } catch (error) {
    if (!warnedMissing && process.env.NODE_ENV !== 'production') {
      console.warn('[supabase] service credentials missing; continuing without persistence');
      warnedMissing = true;
    }
    return null;
  }
}
