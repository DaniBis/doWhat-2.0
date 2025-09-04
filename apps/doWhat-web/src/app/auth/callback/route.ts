// src/app/auth/callback/route.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const cookieStore = cookies();
    // In a Route Handler we can *safely* wire set/remove to Next's cookies API:
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name: string) => cookieStore.get(name)?.value,
          set: (name: string, value: string, options: any) => {
            cookieStore.set({ name, value, ...options });
          },
          remove: (name: string, options: any) => {
            cookieStore.set({ name, value: "", ...options, maxAge: 0 });
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
