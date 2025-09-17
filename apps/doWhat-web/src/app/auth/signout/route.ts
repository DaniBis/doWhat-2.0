// src/app/auth/signout/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = createClient();

  await supabase.auth.signOut();
  
  // Redirect to home page after signout
  return NextResponse.redirect(new URL("/", request.url));
}
