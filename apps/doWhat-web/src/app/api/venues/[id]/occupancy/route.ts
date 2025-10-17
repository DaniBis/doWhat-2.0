import { NextResponse } from "next/server";
import { parseISO } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  try {
    const { data: sessions, error } = await supabase
      .from("sessions")
      .select("id, starts_at, ends_at, price_cents, activity_id")
      .eq("venue_id", params.id)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true });

    if (error) throw error;

    const normalized = (sessions ?? []).map((session) => {
      const start = parseISO(session.starts_at);
      const end = session.ends_at ? parseISO(session.ends_at) : null;
      const durationMinutes = end
        ? Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60)))
        : null;

      return {
        id: session.id,
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        durationMinutes,
        priceCents: session.price_cents ?? 0,
        activityId: session.activity_id,
      };
    });

    return NextResponse.json({ sessions: normalized });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
