// src/app/auth/signout/route.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: (name: string, value: string, options: any) => {
          res.cookies.set({ name, value, ...options });
        },
        remove: (name: string, options: any) => {
          res.cookies.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );

  await supabase.auth.signOut();
  return res;
}
