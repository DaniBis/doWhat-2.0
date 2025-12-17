import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export function createRouteHandlerClient(): SupabaseClient {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: { expires?: Date; maxAge?: number; path?: string }) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options?: { path?: string }) {
          cookieStore.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    },
  );
}
