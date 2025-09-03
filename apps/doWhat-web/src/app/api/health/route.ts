import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createClient();
  const { error } = await supabase.from("profiles").select("id").limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true, supabase: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}