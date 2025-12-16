import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import type { User } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const MAX_DETAILS_LENGTH = 1000;
const HISTORY_LIMIT = 50;

class DisputeError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DisputeError";
    this.status = status;
  }
}

type SessionRow = {
  id: string;
  host_user_id: string;
  ends_at: string | null;
};

type AttendanceRow = {
  status: string | null;
};

type AttendanceDisputeRow = {
  id: string;
  session_id: string;
  reporter_id: string;
  status: string;
  reason: string;
  details: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  sessions?: SessionRelation | SessionRelation[] | null;
};

type SessionRelation = {
  id: string;
  starts_at: string | null;
  ends_at: string | null;
  activities?: RelationValue<{ name?: string | null }>;
  venues?: RelationValue<{ name?: string | null }>;
};

type RelationValue<T> = T | T[] | null | undefined;

type DisputeHistoryResponse = {
  disputes: Array<{
    id: string;
    sessionId: string;
    status: string;
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
      endsAt: string | null;
      startsAt: string | null;
    };
  }>;
};

type SubmitRequest = {
  action?: string;
  sessionId?: string;
  reason?: string;
  details?: string | null;
};

type SubmitResponse = {
  id: string;
  status: string;
  createdAt: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      const user = await requireUser(req);
      const disputes = await fetchDisputeHistory(user.id);
      return json({ disputes });
    }

    if (req.method !== "POST") {
      throw new DisputeError("Method not allowed", 405);
    }

    const payload = await parseRequestBody(req);
    const user = await requireUser(req);

    if (payload.action === "list") {
      const disputes = await fetchDisputeHistory(user.id);
      return json({ disputes });
    }

    if (payload.action && payload.action !== "submit") {
      throw new DisputeError("Unsupported action", 400);
    }

    const normalized = sanitizeSubmitPayload(payload);
    const result = await submitDispute(user.id, normalized);
    return json(result, 201);
  } catch (error) {
    return handleError(error);
  }
});

async function requireUser(req: Request): Promise<User> {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    throw new DisputeError("Please sign in.", 401);
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    throw new DisputeError("Please sign in.", 401);
  }
  return data.user;
}

async function fetchDisputeHistory(userId: string): Promise<DisputeHistoryResponse["disputes"]> {
  const { data, error } = await supabase
    .from("attendance_disputes")
    .select(
      `id, session_id, reporter_id, status, reason, details, resolution_notes, resolved_at, created_at, updated_at,
       sessions(id, starts_at, ends_at, activities(name), venues(name))`,
    )
    .eq("reporter_id", userId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) {
    throw new DisputeError(error.message, 500);
  }

  const rows = (data ?? []) as AttendanceDisputeRow[];
  return rows.map(mapDisputeRow);
}

async function submitDispute(userId: string, payload: { sessionId: string; reason: string; details: string | null }): Promise<SubmitResponse> {
  const session = await getSessionOrThrow(payload.sessionId);
  ensureSessionEnded(session);
  if (session.host_user_id === userId) {
    throw new DisputeError("Hosts can update attendance directly instead of filing disputes.");
  }

  const attendance = await getAttendanceStatus(payload.sessionId, userId);
  if (attendance?.status !== "going") {
    throw new DisputeError("Only attendees marked as going can contest their reliability status.", 403);
  }

  const existing = await getExistingDispute(payload.sessionId, userId);
  if (existing) {
    throw new DisputeError("You already have a dispute for this session.", 409);
  }

  const { data, error } = await supabase
    .from("attendance_disputes")
    .insert({
      session_id: payload.sessionId,
      reporter_id: userId,
      reason: payload.reason,
      details: payload.details,
    })
    .select("id, status, created_at")
    .single();

  if (error || !data) {
    throw new DisputeError(error?.message ?? "Failed to submit dispute.", 500);
  }

  return {
    id: data.id,
    status: data.status,
    createdAt: data.created_at,
  };
}

async function getSessionOrThrow(sessionId: string): Promise<SessionRow> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, host_user_id, ends_at")
    .eq("id", sessionId)
    .maybeSingle<SessionRow>();

  if (error) {
    throw new DisputeError(error.message, 500);
  }
  if (!data) {
    throw new DisputeError("Session not found.", 404);
  }
  return data;
}

function ensureSessionEnded(session: SessionRow) {
  if (!session.ends_at) {
    throw new DisputeError("This session has not ended yet.");
  }
  const endsAt = new Date(session.ends_at).getTime();
  if (Number.isNaN(endsAt) || endsAt > Date.now()) {
    throw new DisputeError("You can only report issues after the session ends.");
  }
}

async function getAttendanceStatus(sessionId: string, userId: string): Promise<AttendanceRow | null> {
  const { data, error } = await supabase
    .from("session_attendees")
    .select("status")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle<AttendanceRow>();
  if (error && error.code !== "PGRST116") {
    throw new DisputeError(error.message, 500);
  }
  return data ?? null;
}

async function getExistingDispute(sessionId: string, userId: string) {
  const { data, error } = await supabase
    .from("attendance_disputes")
    .select("id, status")
    .eq("session_id", sessionId)
    .eq("reporter_id", userId)
    .neq("status", "dismissed")
    .maybeSingle<{ id: string; status: string }>();
  if (error && error.code !== "PGRST116") {
    throw new DisputeError(error.message, 500);
  }
  return data ?? null;
}

function mapDisputeRow(row: AttendanceDisputeRow): DisputeHistoryResponse["disputes"][number] {
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

function getRelationValue<T>(value: RelationValue<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function parseRequestBody(req: Request): Promise<SubmitRequest> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {};
  }
  try {
    const body = (await req.json()) as SubmitRequest;
    return body ?? {};
  } catch {
    return {};
  }
}

function sanitizeSubmitPayload(raw: SubmitRequest): { sessionId: string; reason: string; details: string | null } {
  const sessionId = sanitizeId(raw.sessionId ?? null);
  if (!sessionId) {
    throw new DisputeError("sessionId is required.");
  }
  const reason = sanitizeReason(raw.reason);
  const details = sanitizeDetails(raw.details);
  return { sessionId, reason, details };
}

function sanitizeId(value: string | null): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function sanitizeReason(value: unknown): string {
  if (typeof value !== "string") {
    throw new DisputeError("reason must be a string.");
  }
  const trimmed = value.trim();
  if (trimmed.length < 3) {
    throw new DisputeError("reason must be at least 3 characters long.");
  }
  if (trimmed.length > 120) {
    throw new DisputeError("reason must be 120 characters or fewer.");
  }
  return trimmed;
}

function sanitizeDetails(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new DisputeError("details must be a string when provided.");
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_DETAILS_LENGTH) {
    throw new DisputeError(`details must be ${MAX_DETAILS_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function handleError(error: unknown) {
  if (error instanceof DisputeError) {
    return json({ error: error.message }, error.status);
  }
  console.error("[mobile-disputes] unexpected error", error);
  return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
}
