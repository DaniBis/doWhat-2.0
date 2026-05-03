// src/app/auth/callback/route.ts
import { createRouteHandlerClient } from "@/lib/supabase/routeHandler";
import { sanitizeRedirectPath } from "@/lib/access/coreAccess";
import { resolveAuthRedirectPath } from "@/lib/authRedirects";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_REDIRECT_PATH = process.env.NEXT_PUBLIC_AUTH_SUCCESS_PATH || "/";
const ERROR_REDIRECT_PATH = process.env.NEXT_PUBLIC_AUTH_ERROR_PATH || "/auth?status=error";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const token = url.searchParams.get("token_hash") ?? url.searchParams.get("token");
  const type = (url.searchParams.get("type") ?? "signup") as EmailOtpType;
  const supabase = createRouteHandlerClient();

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else if (token) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: token });
      if (error) throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auth error";
    const errorUrl = new URL(sanitizeRedirectPath(ERROR_REDIRECT_PATH, "/auth?status=error"), request.url);
    errorUrl.searchParams.set("message", message);
    return NextResponse.redirect(errorUrl);
  }

  return NextResponse.redirect(new URL(resolveAuthRedirectPath(url, DEFAULT_REDIRECT_PATH), request.url));
}
