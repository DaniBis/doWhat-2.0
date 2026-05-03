const FALLBACK_SUPABASE_URL = "https://placeholder.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "placeholder-anon-key";

let warnedMissing = false;

export function getSupabasePublicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    return { url, anonKey };
  }

  const isProduction = process.env.NODE_ENV === "production";
  if (!warnedMissing) {
    if (isProduction) {
      console.error(
        "[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in production mode; using placeholder non-persistent client",
      );
    } else {
      console.warn("[supabase] public env missing; using non-persistent placeholder client in non-production mode");
    }
    warnedMissing = true;
  }

  return {
    url: FALLBACK_SUPABASE_URL,
    anonKey: FALLBACK_SUPABASE_ANON_KEY,
  };
}
