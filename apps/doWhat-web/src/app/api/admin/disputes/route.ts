import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";
import type { AttendanceDisputeRow } from "@/types/database";
import type { DisputeStatus } from "@/lib/disputes/statusTokens";

const MAX_LIMIT = 200;
const MAX_RESOLUTION_NOTES = 2000;

const DISPUTE_STATUSES: DisputeStatus[] = ["open", "reviewing", "resolved", "dismissed"];
const STATUS_SET = new Set(DISPUTE_STATUSES);

class AdminAccessError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = "AdminAccessError";
    this.statusCode = statusCode;
  }
}

const parseAllowList = (): string[] =>
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(/[ ,]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const clampLimit = (value: number) => {
  if (!Number.isFinite(value)) return 50;
  return Math.min(Math.max(Math.trunc(value), 1), MAX_LIMIT);
};

type AdminContext = { userId: string; email: string };

type Reporter = { id: string; full_name?: string | null; avatar_url?: string | null };

type SessionDetails = {
  id: string;
  starts_at: string | null;
  ends_at: string | null;
  activities?: RelationValue<{ name?: string | null }>;
  venues?: RelationValue<{ name?: string | null }>;
};

type RelationValue<T> = T | T[] | null | undefined;

type RawRow = AttendanceDisputeRow & {
  reporter?: RelationValue<Reporter>;
  sessions?: RelationValue<SessionDetails>;
};

type AdminDispute = {
  id: string;
  sessionId: string;
  reporterId: string;
  status: DisputeStatus;
  reason: string;
  details: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  session: {
    id: string;
    title: string | null;
    venue: string | null;
    startsAt: string | null;
    endsAt: string | null;
  };
  reporter: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
  };
};

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const service = createServiceClient();
    const url = new URL(req.url);
    const statusParam = (url.searchParams.get("status") || "open").toLowerCase();
    const limit = clampLimit(Number(url.searchParams.get("limit") || "50"));
    const statusFilter = STATUS_SET.has(statusParam as DisputeStatus) ? (statusParam as DisputeStatus) : null;

    let query = service
      .from("attendance_disputes")
      .select(
        `id, session_id, reporter_id, status, reason, details, resolution_notes, resolved_at, created_at, updated_at,
         reporter:profiles!attendance_disputes_reporter_id_fkey(id, full_name, avatar_url),
         sessions(id, starts_at, ends_at, activities(name), venues(name))`,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error, count } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const disputes = (data ?? []).map(mapAdminDispute);
    const statusCounts = await getStatusCounts(service);
    return NextResponse.json({ disputes, limit, total: count ?? disputes.length, statusCounts, statuses: DISPUTE_STATUSES });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireAdmin();
    const payload = await parsePatchPayload(req);
    const service = createServiceClient();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.status) {
      updates.status = payload.status;
      updates.resolved_at = payload.status === "resolved" || payload.status === "dismissed" ? new Date().toISOString() : null;
    }
    if (payload.resolutionNotes !== undefined) {
      updates.resolution_notes = payload.resolutionNotes;
    }

    const { error: updateError } = await service
      .from("attendance_disputes")
      .update(updates)
      .eq("id", payload.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await logAuditEvent(service, admin, payload);

    const refreshed = await service
      .from("attendance_disputes")
      .select(
        `id, session_id, reporter_id, status, reason, details, resolution_notes, resolved_at, created_at, updated_at,
         reporter:profiles!attendance_disputes_reporter_id_fkey(id, full_name, avatar_url),
         sessions(id, starts_at, ends_at, activities(name), venues(name))`,
      )
      .eq("id", payload.id)
      .maybeSingle<RawRow>();

    if (refreshed.error) {
      throw new Error(refreshed.error.message);
    }

    return NextResponse.json({ dispute: refreshed.data ? mapAdminDispute(refreshed.data) : null });
  } catch (error) {
    return handleError(error);
  }
}

async function requireAdmin(): Promise<AdminContext> {
  const allowList = parseAllowList();
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw new AdminAccessError("Unable to verify session.", 500);
  }
  const userId = data?.user?.id ?? null;
  const email = data?.user?.email?.toLowerCase() ?? null;
  if (!userId || !email) {
    throw new AdminAccessError("Please sign in.", 401);
  }
  if (!allowList.includes(email)) {
    throw new AdminAccessError("You are not authorized to manage disputes.");
  }
  return { userId, email };
}

async function parsePatchPayload(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AdminAccessError("Request body must be valid JSON.", 400);
  }
  if (!body || typeof body !== "object") {
    throw new AdminAccessError("Request body must be an object.", 400);
  }
  const raw = body as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) {
    throw new AdminAccessError("id is required.", 400);
  }

  let status: DisputeStatus | undefined;
  if (raw.status !== undefined) {
    if (typeof raw.status !== "string" || !STATUS_SET.has(raw.status as DisputeStatus)) {
      throw new AdminAccessError("Invalid status.", 400);
    }
    status = raw.status as DisputeStatus;
  }

  let resolutionNotes: string | null | undefined;
  if (raw.resolutionNotes !== undefined) {
    if (raw.resolutionNotes === null) {
      resolutionNotes = null;
    } else if (typeof raw.resolutionNotes === "string") {
      const trimmed = raw.resolutionNotes.trim();
      if (trimmed.length > MAX_RESOLUTION_NOTES) {
        throw new AdminAccessError(`Resolution notes must be ${MAX_RESOLUTION_NOTES} characters or fewer.`, 400);
      }
      resolutionNotes = trimmed || null;
    } else {
      throw new AdminAccessError("resolutionNotes must be a string or null.", 400);
    }
  }

  if (!status && resolutionNotes === undefined) {
    throw new AdminAccessError("Provide at least one field to update.", 400);
  }

  return { id, status, resolutionNotes };
}

async function logAuditEvent(
  service: ReturnType<typeof createServiceClient>,
  admin: AdminContext,
  payload: { id: string; status?: DisputeStatus; resolutionNotes?: string | null }
) {
  try {
    await service.from("admin_audit_logs").insert({
      actor_email: admin.email,
      action: "update_dispute",
      entity_type: "attendance_disputes",
      entity_id: payload.id,
      details: {
        status: payload.status ?? null,
        hasResolutionNotes: payload.resolutionNotes ? true : false,
      },
    });
  } catch (error) {
    console.warn("[admin/disputes] Failed to log audit event", getErrorMessage(error));
  }
}

function getRelationValue<T>(value: RelationValue<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapAdminDispute(row: RawRow): AdminDispute {
  const session = getRelationValue(row.sessions);
  const reporter = getRelationValue(row.reporter);
  const activity = getRelationValue(session?.activities);
  const venue = getRelationValue(session?.venues);
  return {
    id: row.id,
    sessionId: row.session_id,
    reporterId: row.reporter_id,
    status: row.status as DisputeStatus,
    reason: row.reason,
    details: row.details ?? null,
    resolutionNotes: row.resolution_notes ?? null,
    resolvedAt: row.resolved_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    session: {
      id: session?.id ?? row.session_id,
      title: activity?.name ?? null,
      venue: venue?.name ?? null,
      startsAt: session?.starts_at ?? null,
      endsAt: session?.ends_at ?? null,
    },
    reporter: {
      id: reporter?.id ?? row.reporter_id,
      name: reporter?.full_name ?? null,
      avatarUrl: reporter?.avatar_url ?? null,
    },
  };
}

async function getStatusCounts(service: ReturnType<typeof createServiceClient>) {
  const entries = await Promise.all(
    DISPUTE_STATUSES.map(async (status) => {
      const { count, error } = await service
        .from("attendance_disputes")
        .select("id", { head: true, count: "exact" })
        .eq("status", status);
      if (error) {
        throw new Error(error.message);
      }
      return [status, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<DisputeStatus, number>;
}

function handleError(error: unknown) {
  if (error instanceof AdminAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  return NextResponse.json({ error: getErrorMessage(error) ?? "Unknown error" }, { status: 500 });
}
