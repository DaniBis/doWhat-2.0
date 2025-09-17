// Service-role Supabase client (bypasses RLS) for cron / backend jobs.
import { createClient } from '@supabase/supabase-js';

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY; // allow either env name
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE service environment variables');
  }
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
