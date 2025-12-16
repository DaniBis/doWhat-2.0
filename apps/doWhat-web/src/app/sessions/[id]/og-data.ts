import { hydrateSessions } from "@/lib/sessions/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { SessionOpenSlotRow, SessionRow } from "@/types/database";

export type SessionOgContext = {
  id: string;
  title: string;
  venue: string;
  startsAt: string | null;
  hostName: string | null;
  openSlots: number;
  skillLabel: string | null;
  description: string | null;
};

const FALLBACK_TITLE = "doWhat session";
const FALLBACK_VENUE = "Location TBA";

export async function fetchSessionOgContext(sessionId: string): Promise<SessionOgContext | null> {
  try {
    const service = createServiceClient();
    const { data: session, error } = await service
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle<SessionRow>();

    if (error) {
      throw error;
    }
    if (!session) {
      return null;
    }

    const [hydrated] = await hydrateSessions(service, [session]);
    if (!hydrated) {
      return null;
    }

    const { data: slotRows, error: slotError } = await service
      .from("session_open_slots")
      .select("slots_count, required_skill_level")
      .eq("session_id", sessionId);

    if (slotError) {
      throw slotError;
    }

    const typedSlots = (slotRows ?? []) as SessionOpenSlotRow[];
    const openSlots = typedSlots.reduce((total, row) => total + (row.slots_count ?? 0), 0);
    const skillLabel = typedSlots.find((row) => (row.required_skill_level ?? "").trim().length > 0)?.required_skill_level
      ?? typedSlots[0]?.required_skill_level
      ?? null;

    return {
      id: hydrated.id,
      title: hydrated.activity?.name ?? FALLBACK_TITLE,
      venue: hydrated.venue?.name ?? hydrated.activity?.venueLabel ?? FALLBACK_VENUE,
      startsAt: hydrated.startsAt ?? null,
      hostName: hydrated.host?.fullName ?? null,
      openSlots,
      skillLabel: skillLabel?.trim() ? skillLabel : null,
      description: hydrated.description ?? hydrated.activity?.description ?? null,
    };
  } catch (error) {
    console.error(`[session-og] Failed to fetch session ${sessionId}`, error);
    return null;
  }
}

export function formatSessionOgDate(isoDate: string | null): { dateLabel: string; timeLabel: string } {
  if (!isoDate) {
    return { dateLabel: "Date TBA", timeLabel: "" };
  }
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return { dateLabel: "Date TBA", timeLabel: "" };
  }

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  return { dateLabel, timeLabel };
}
