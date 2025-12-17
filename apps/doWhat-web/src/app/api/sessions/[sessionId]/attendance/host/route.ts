import { NextResponse } from "next/server";

import {
  getSessionOrThrow,
  resolveApiUser,
  SessionValidationError,
} from "@/lib/sessions/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";
import { normalizeVerifiedFlag, type ReliabilityUpdateInput } from "@/lib/sessions/attendanceReliability";
import type { AttendanceStatus, SessionAttendeeRow } from "@/types/database";

interface RouteContext {
  params: { sessionId: string };
}

type HostRosterRow = {
  userId: string;
  fullName: string | null;
  username: string | null;
  status: SessionAttendeeRow["status"];
  attendanceStatus: AttendanceStatus;
  verified: boolean;
};

type SupabaseRosterRow = {
  user_id: string;
  status: SessionAttendeeRow["status"];
  attendance_status: AttendanceStatus;
  checked_in: boolean | null;
  profiles?:
    | null
    | { full_name?: string | null; username?: string | null }
    | Array<{ full_name?: string | null; username?: string | null }>;
};

type HostRosterResponse = {
  sessionId: string;
  attendees: HostRosterRow[];
};

type HostUpdatePayload = {
  updates: ReliabilityUpdateInput[];
};

export async function GET(req: Request, context: RouteContext) {
  try {
    const sessionId = sanitizeId(context.params.sessionId);
    if (!sessionId) {
      throw new SessionValidationError("Session id is required.");
    }

    const user = await resolveApiUser(req);
    if (!user) {
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }

    const service = createServiceClient();
    const session = await getSessionOrThrow(service, sessionId);
    ensureHost(user.id, session.host_user_id);

    const { data, error } = await service
      .from("session_attendees")
      .select("user_id, status, attendance_status, checked_in, profiles(full_name, username)")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const typedRows = (data ?? []) as SupabaseRosterRow[];
    const attendees: HostRosterRow[] = typedRows.map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles ?? null;
      return {
        userId: row.user_id,
        status: row.status,
        attendanceStatus: row.attendance_status,
        verified: Boolean(row.checked_in),
        fullName: profile?.full_name ?? null,
        username: profile?.username ?? null,
      };
    });

    const body: HostRosterResponse = {
      sessionId,
      attendees,
    };

    return NextResponse.json(body);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const sessionId = sanitizeId(context.params.sessionId);
    if (!sessionId) {
      throw new SessionValidationError("Session id is required.");
    }

    const user = await resolveApiUser(req);
    if (!user) {
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }

    let payload: HostUpdatePayload;
    try {
      payload = (await req.json()) as HostUpdatePayload;
    } catch {
      throw new SessionValidationError("Invalid JSON payload.");
    }

    if (!Array.isArray(payload.updates) || payload.updates.length === 0) {
      throw new SessionValidationError("Provide at least one attendee update.");
    }

    const service = createServiceClient();
    const session = await getSessionOrThrow(service, sessionId);
    ensureHost(user.id, session.host_user_id);

    const sanitized = payload.updates
      .map((update) => sanitizeUpdate(update))
      .filter((update): update is Required<ReliabilityUpdateInput> => Boolean(update));

    if (!sanitized.length) {
      throw new SessionValidationError("No valid updates provided.");
    }

    const applied: ReliabilityUpdateInput[] = [];
    for (const update of sanitized) {
      const verified = normalizeVerifiedFlag(update.attendanceStatus, update.verified);
      const { data, error } = await service
        .from("session_attendees")
        .update({
          attendance_status: update.attendanceStatus,
          checked_in: verified,
          attended_at: update.attendanceStatus === "attended" ? new Date().toISOString() : null,
        })
        .eq("session_id", sessionId)
        .eq("user_id", update.userId)
        .select("user_id");
      if (error) throw error;
      if (!data?.length) {
        throw new SessionValidationError(`No attendance record found for user ${update.userId}.`, 404);
      }
      applied.push({ ...update, verified });
    }

    return NextResponse.json({ sessionId, applied: applied.length });
  } catch (error) {
    return handleError(error);
  }
}

function sanitizeUpdate(update: ReliabilityUpdateInput | undefined): ReliabilityUpdateInput | null {
  if (!update) return null;
  const userId = sanitizeId(update.userId);
  if (!userId) return null;
  const attendanceStatus = parseAttendanceStatus(update.attendanceStatus);
  return {
    userId,
    attendanceStatus,
    verified: Boolean(update.verified),
  };
}

function parseAttendanceStatus(value: unknown): AttendanceStatus {
  if (value === "attended" || value === "late_cancel" || value === "no_show" || value === "registered") {
    return value;
  }
  throw new SessionValidationError("Invalid attendance status.");
}

function sanitizeId(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function ensureHost(userId: string, hostId: string) {
  if (userId !== hostId) {
    throw new SessionValidationError("Only the host can record attendance.", 403);
  }
}

function handleError(error: unknown) {
  if (error instanceof SessionValidationError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  let message = getErrorMessage(error);
  if (/row-level security/i.test(message)) {
    message = "Operation blocked by Supabase Row Level Security. Update your policies to allow this action.";
  }
  return NextResponse.json({ error: message }, { status: 500 });
}
