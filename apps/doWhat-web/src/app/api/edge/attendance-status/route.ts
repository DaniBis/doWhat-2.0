import { NextResponse } from "next/server";

/**
 * Deprecated: reliability scoring now happens inside Postgres triggers.
 * Keep the route returning 410 so any lingering clients fail fast during rollout.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Deprecated. Reliability scoring now runs inside the database." },
    { status: 410 },
  );
}
