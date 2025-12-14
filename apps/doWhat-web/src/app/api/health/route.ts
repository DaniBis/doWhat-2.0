import { NextResponse } from "next/server";
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  let supabaseOk = true;
  try {
    const { error } = await supabase.from("profiles").select("id", { head: true, count: 'exact' }).limit(1);
    if (error) throw error;
  } catch {
    supabaseOk = false;
  }

  const tablesToCheck = ["badges", "user_badges", "traits_catalog", "trait_events", "user_traits"];
  const tables: Record<string, boolean> = {};
  await Promise.all(tablesToCheck.map(async (t) => {
    try {
      const { error } = await supabase.from(t).select("*", { head: true, count: 'exact' }).limit(1);
      tables[t] = !error;
    } catch {
      tables[t] = false;
    }
  }));
  const missing = Object.entries(tables).filter(([, v]) => !v).map(([n]) => n);
  return NextResponse.json({ ok: supabaseOk && missing.length === 0, supabase: supabaseOk, tables, missing });
}
