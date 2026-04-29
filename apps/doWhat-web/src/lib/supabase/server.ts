import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export function createClient(): SupabaseClient {
  const cookieStore = cookies();
  const { url, anonKey } = getSupabasePublicEnv();

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        // In Server Components we can READ cookies but we must NOT mutate them.
        // See: https://nextjs.org/docs/app/api-reference/functions/cookies
        get: (name: string) => cookieStore.get(name)?.value,
        // No-ops to avoid "Cookies can only be modified in a Server Action or Route Handler".
        set: () => {},
        remove: () => {},
      },
    }
  );
}
