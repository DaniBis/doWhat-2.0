import { NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createBrowserClient } from '@supabase/supabase-js';

export async function getUserFromRequest(req: NextRequest) {
  // Try cookie-based (SSR) first
  try {
    const supabase = createServerClient();
    const { data } = await supabase.auth.getUser();
    if (data?.user) return { user: data.user, supabase }; // Return server client for downstream queries
  } catch (_) {}

  // Fallback: Authorization: Bearer <token>
  const authz = req.headers.get('authorization') || req.headers.get('Authorization');
  if (authz?.startsWith('Bearer ')) {
    const token = authz.slice('Bearer '.length).trim();
    if (token) {
      // Lightweight audience validation (best-effort, non-cryptographic)
      let audOk = true;
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          const aud = payload.aud || payload.iss || null;
          if (aud && typeof aud === 'string') {
            audOk = ['authenticated', 'anon'].includes(aud) || aud.includes('supabase');
          } else if (Array.isArray(aud)) {
            audOk = aud.some((a: string) => a === 'authenticated');
          }
        }
      } catch (_) {
        audOk = false;
      }
      if (!audOk) return { user: null, supabase: null };
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, detectSessionInUrl: false },
        }
      );
      const { data } = await supabase.auth.getUser();
      if (data?.user) return { user: data.user, supabase };
    }
  }
  return { user: null, supabase: null };
}
