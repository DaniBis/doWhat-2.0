// src/app/auth/callback/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

interface CookieSetOptions { path?: string; maxAge?: number; domain?: string; secure?: boolean; httpOnly?: boolean; sameSite?: "strict"|"lax"|"none"; expires?: Date }

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
  const supabase = createClient();

    // This sets the auth cookies:
    await supabase.auth.exchangeCodeForSession(code);
  }

  // send the user somewhere after auth
  return NextResponse.redirect(new URL("/", request.url));
}
