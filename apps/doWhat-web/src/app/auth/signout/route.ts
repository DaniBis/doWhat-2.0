// src/app/auth/signout/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";

export async function POST() {
  const res = NextResponse.json({ ok: true });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const c = nextCookies();
          return c.getAll().map((ck) => ({ name: ck.name, value: ck.value }));
        },
        setAll(cookies) {
          cookies.forEach((ck) => res.cookies.set(ck.name, ck.value, ck.options));
        },
      },
    }
  );

  await supabase.auth.signOut();
  return res;
}
