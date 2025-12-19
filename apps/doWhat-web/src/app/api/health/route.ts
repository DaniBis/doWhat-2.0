import { NextResponse } from "next/server";
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { createClient } from "@/lib/supabase/server";

type TableHealth = {
  ok: boolean;
  error?: string;
};

export async function GET() {
  const supabase = createClient();
  let supabaseOk = true;
  const issues: string[] = [];

  try {
    const { error } = await supabase
      .from("profiles")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (error) {
      issues.push(`[profiles] ${error.message ?? "unknown error"}`);
      throw error;
    }
  } catch (error) {
    supabaseOk = false;
    if (error instanceof Error) {
      issues.push(error.message);
    }
  }

  const tablesToCheck = ["badges", "user_badges", "traits_catalog", "trait_events", "user_traits"];
  const tables: Record<string, TableHealth> = {};

  await Promise.all(
    tablesToCheck.map(async (table) => {
      try {
        const { error } = await supabase
          .from(table)
          .select("*", { head: true, count: "exact" })
          .limit(1);
        tables[table] = { ok: !error, error: error?.message };
        if (error) {
          issues.push(`[${table}] ${error.message ?? "unknown error"}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        tables[table] = { ok: false, error: message };
        issues.push(`[${table}] ${message}`);
      }
    }),
  );

  const missing = Object.entries(tables)
    .filter(([, { ok }]) => !ok)
    .map(([name]) => name);

  return NextResponse.json({
    ok: supabaseOk && missing.length === 0,
    supabase: supabaseOk,
    tables,
    missing,
    issues,
  });
}
