import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { getSessionOrThrow, resolveApiUser } from "@/lib/sessions/server";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";
import type { AttendanceDisputeRow } from "@/types/database";

const MAX_DETAILS_LENGTH = 1000;
const DISPUTE_HISTORY_LIMIT = 50;

class DisputeValidationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DisputeValidationError";
    this.statusCode = statusCode;
  }
}

type SessionRelation = {
  id: string;
  ends_at: string | null;
  starts_at: string | null;
  activities?: RelationValue<{ name?: string | null }>;
  venues?: RelationValue<{ name?: string | null }>;
};

type RelationValue<T> = T | T[] | null | undefined;

type DisputeHistoryRow = AttendanceDisputeRow & {
  sessions?: RelationValue<SessionRelation>;
};

export async function GET(req: Request) {
  try {
    const user = await resolveApiUser(req);
    if (!user) {
      throw new DisputeValidationError("Please sign in.", 401);
    }

    const service = createServiceClient();
    const { data, error } = await service
      .from("attendance_disputes")
      .select(
        `id, session_id, reporter_id, status, reason, details, resolution_notes, resolved_at, created_at, updated_at,
         sessions(id, ends_at, starts_at, activities(name), venues(name))`,
      )
      .eq("reporter_id", user.id)
      .order("created_at", { ascending: false })
      .limit(DISPUTE_HISTORY_LIMIT);

    if (error) {
      throw new Error(error.message);
    }

    const rawRows = (data ?? []) as DisputeHistoryRow[];
    const disputes = rawRows.map(mapDispute);

    return NextResponse.json({ disputes });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await resolveApiUser(req);
    if (!user) {
      throw new DisputeValidationError("Please sign in.", 401);
    }

    const payload = await parseRequestBody(req);
    const service = createServiceClient();
    const session = await getSessionOrThrow(service, payload.sessionId);

    if (!session.ends_at) {
      throw new DisputeValidationError("This session has not ended yet.");
    }
    const sessionEndedAt = new Date(session.ends_at);
    if (Number.isNaN(sessionEndedAt.getTime()) || sessionEndedAt.getTime() > Date.now()) {
      throw new DisputeValidationError("You can only report issues after the session ends.");
    }
    if (session.host_user_id === user.id) {
      throw new DisputeValidationError("Hosts can update attendance directly instead of filing disputes.");
    }

    const attendance = await service
      .from("session_attendees")
      .select("status")
      .eq("session_id", payload.sessionId)
      .eq("user_id", user.id)
      .maybeSingle<{ status: string }>();

    if (attendance.error) {
      throw new Error(attendance.error.message);
    }
    if (!attendance.data || attendance.data.status !== "going") {
      throw new DisputeValidationError("Only attendees marked as going can contest their reliability status.", 403);
    }

    const existing = await service
      .from("attendance_disputes")
      .select("id,status")
      .eq("session_id", payload.sessionId)
      .eq("reporter_id", user.id)
      .neq("status", "dismissed")
      .maybeSingle<{ id: string; status: AttendanceDisputeRow["status"] }>();

    if (existing.error && existing.error.code !== "PGRST116") {
      throw new Error(existing.error.message);
    }
    if (existing.data) {
      throw new DisputeValidationError("You already have a dispute for this session.", 409);
    }

    const inserted = await service
      .from("attendance_disputes")
      .insert({
        session_id: payload.sessionId,
        reporter_id: user.id,
        reason: payload.reason,
        details: payload.details,
      })
      .select("id,status,created_at")
      .single();

    if (inserted.error || !inserted.data) {
      throw new Error(inserted.error?.message ?? "Failed to submit dispute.");
    }

    return NextResponse.json(
      {
        id: inserted.data.id,
        status: inserted.data.status,
        createdAt: inserted.data.created_at,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}

type ParsedPayload = {
  sessionId: string;
  reason: string;
  details: string | null;
};

async function parseRequestBody(req: Request): Promise<ParsedPayload> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new DisputeValidationError("Request body must be valid JSON.");
  }
  if (!body || typeof body !== "object") {
    throw new DisputeValidationError("Request body must be an object.");
  }
  const raw = body as Record<string, unknown>;
  const sessionId = sanitizeId(raw.sessionId ?? raw.session_id);
  if (!sessionId) {
    throw new DisputeValidationError("sessionId is required.");
  }
  const reason = sanitizeReason(raw.reason);
  const details = sanitizeDetails(raw.details);
  return { sessionId, reason, details };
}

function sanitizeId(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function sanitizeReason(value: unknown): string {
  if (typeof value !== "string") {
    throw new DisputeValidationError("reason must be a string.");
  }
  const trimmed = value.trim();
  if (trimmed.length < 3) {
    throw new DisputeValidationError("reason must be at least 3 characters long.");
  }
  if (trimmed.length > 120) {
    throw new DisputeValidationError("reason must be 120 characters or fewer.");
  }
  return trimmed;
}

function sanitizeDetails(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new DisputeValidationError("details must be a string when provided.");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_DETAILS_LENGTH) {
    throw new DisputeValidationError(`details must be ${MAX_DETAILS_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

function handleError(error: unknown) {
  if (error instanceof DisputeValidationError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  const message = getErrorMessage(error);
  return NextResponse.json({ error: message }, { status: 500 });
}

function getRelationValue<T>(value: RelationValue<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapDispute(row: DisputeHistoryRow) {
  const session = getRelationValue(row.sessions);
  const activity = getRelationValue(session?.activities);
  const venue = getRelationValue(session?.venues);
  return {
    id: row.id,
    sessionId: row.session_id,
    status: row.status,
    reason: row.reason,
    details: row.details,
    resolutionNotes: row.resolution_notes,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    session: {
      id: session?.id ?? row.session_id,
      title: activity?.name ?? null,
      venue: venue?.name ?? null,
      endsAt: session?.ends_at ?? null,
      startsAt: session?.starts_at ?? null,
    },
  };
}
