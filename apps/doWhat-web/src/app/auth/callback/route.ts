// src/app/auth/callback/route.ts
import { createServerClient } from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    // In a Route Handler we can *safely* wire set/remove to Next's cookies API:
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          // New API: getAll/setAll
          getAll() {
            const c = nextCookies();
            return c.getAll().map((ck) => ({ name: ck.name, value: ck.value }));
          },
          setAll(cookies) {
            const c = nextCookies();
            cookies.forEach((ck) => c.set(ck.name, ck.value, ck.options));
          },
        },
      }
    );

    // This sets the auth cookies:
    await supabase.auth.exchangeCodeForSession(code);
  }

  // send the user somewhere after auth
  return NextResponse.redirect(new URL("/", request.url));
}
