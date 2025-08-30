import { createServerClient } from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";

// Server Component-safe client: only cookie get is wired; set/remove are no-ops
export function createClient() {
  const cookieStore = nextCookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
}
