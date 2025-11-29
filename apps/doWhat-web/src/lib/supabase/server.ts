import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createClient<TDatabase extends Database = Database>(): SupabaseClient<TDatabase> {
  const cookieStore = cookies();

  return createServerClient<TDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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