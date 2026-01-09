// apps/doWhat-web/src/lib/supabase/browser.ts
import { createBrowserClient } from "@supabase/ssr";
import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";

export const supabase: SupabaseClient = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type GetUserResponse = Awaited<ReturnType<(typeof supabase)["auth"]["getUser"]>>;
const USER_CACHE_TTL_MS = 15_000;

let cachedUser: GetUserResponse | null = null;
let cacheExpiry = 0;
let inflightUserRequest: Promise<GetUserResponse> | null = null;

const originalGetUser = supabase.auth.getUser.bind(supabase.auth);

const patchGetUser = async (...args: Parameters<typeof originalGetUser>): Promise<GetUserResponse> => {
  if (args.length > 0) {
    return originalGetUser(...args);
  }
  const now = Date.now();
  if (cachedUser && now < cacheExpiry) {
    return cachedUser;
  }
  if (inflightUserRequest) {
    return inflightUserRequest;
  }
  inflightUserRequest = originalGetUser();
  try {
    const result = await inflightUserRequest;
    cachedUser = result;
    cacheExpiry = Date.now() + USER_CACHE_TTL_MS;
    return result;
  } finally {
    inflightUserRequest = null;
  }
};

supabase.auth.getUser = patchGetUser as typeof supabase.auth.getUser;

const originalOnAuthStateChange = supabase.auth.onAuthStateChange.bind(supabase.auth);

supabase.auth.onAuthStateChange = ((callback) =>
  originalOnAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
    cachedUser = null;
    cacheExpiry = 0;
    callback(event, session);
  })) as typeof supabase.auth.onAuthStateChange;