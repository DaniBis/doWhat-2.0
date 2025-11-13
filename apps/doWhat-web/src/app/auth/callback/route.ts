// src/app/auth/callback/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

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
