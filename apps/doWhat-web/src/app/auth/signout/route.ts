// src/app/auth/signout/route.ts
import { createRouteHandlerClient } from "@/lib/supabase/routeHandler";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient();

  await supabase.auth.signOut();
  
  // Redirect to home page after signout
  return NextResponse.redirect(new URL("/", request.url));
}
