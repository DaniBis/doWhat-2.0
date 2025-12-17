import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import type { User } from "https://esm.sh/@supabase/supabase-js@2.48.0";

type AttendanceStatus = "going" | "interested" | "declined" | null;

type AttendanceCounts = {
  going: number;
  interested: number;
  declined: number;
  total: number;
  verified: number;
};

type AttendanceSummaryResponse = {
  sessionId: string;
  userId: string | null;
  status: AttendanceStatus;
  counts: AttendanceCounts;
  maxAttendees: number;
};

type AttendanceMutationResponse = {
  sessionId: string;
  userId: string;
  status: AttendanceStatus;
  previousStatus: AttendanceStatus;
  counts: AttendanceCounts;
};

type RequestPayload = {
  action?: string;
  sessionId?: string;
  status?: string;
};

type SessionRow = {
  id: string;
  max_attendees: number | null;
};

type SessionAttendeeRow = {
  status: AttendanceStatus;
};

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

class AttendanceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await parseRequestPayload(req);
    const action = (payload.action ?? "summary").toLowerCase();

    if (action === "summary") {
      const response = await handleSummary(req, payload);
      return json(response);
    }

    if (action === "join") {
      const response = await handleJoin(req, payload);
      return json(response);
    }

    if (action === "leave") {
      const response = await handleLeave(req, payload);
      return json(response);
    }

    throw new AttendanceError("Unsupported action.");
  } catch (error) {
    return handleError(error);
  }
});

async function handleSummary(req: Request, payload: RequestPayload): Promise<AttendanceSummaryResponse> {
  const sessionId = sanitizeId(payload.sessionId);
  if (!sessionId) {
    throw new AttendanceError("sessionId is required.");
  }

  const [session, user] = await Promise.all([
    getSessionOrThrow(sessionId),
    getUserFromRequest(req, { required: false }),
  ]);

  const [counts, status] = await Promise.all([
    getAttendanceCounts(sessionId),
    user ? getUserAttendanceStatus(sessionId, user.id) : Promise.resolve<AttendanceStatus>(null),
  ]);

  return {
    sessionId,
    userId: user?.id ?? null,
    status,
    counts,
    maxAttendees: session.max_attendees ?? 0,
  };
}

async function handleJoin(req: Request, payload: RequestPayload): Promise<AttendanceMutationResponse> {
  const sessionId = sanitizeId(payload.sessionId);
  if (!sessionId) {
    throw new AttendanceError("sessionId is required.");
  }
  const desiredStatus = parseStatus(payload.status ?? "going");
  const user = await getUserFromRequest(req, { required: true });
  const session = await getSessionOrThrow(sessionId);
  const existingStatus = await getUserAttendanceStatus(sessionId, user.id);

  if (desiredStatus === "going") {
    const counts = await getAttendanceCounts(sessionId);
    const effectiveGoing = counts.going - (existingStatus === "going" ? 1 : 0);
    if (effectiveGoing >= (session.max_attendees ?? 0)) {
      throw new AttendanceError("Session is full.", 409);
    }
  }

  const { error } = await supabase
    .from("session_attendees")
    .upsert({ session_id: sessionId, user_id: user.id, status: desiredStatus }, { onConflict: "session_id,user_id" });
  if (error) {
    throw new AttendanceError(error.message ?? "Failed to update attendance.", 500);
  }

  const counts = await getAttendanceCounts(sessionId);
  return {
    sessionId,
    userId: user.id,
    status: desiredStatus,
    previousStatus: existingStatus,
    counts,
  };
}

async function handleLeave(req: Request, payload: RequestPayload): Promise<AttendanceMutationResponse> {
  const sessionId = sanitizeId(payload.sessionId);
  if (!sessionId) {
    throw new AttendanceError("sessionId is required.");
  }
  const user = await getUserFromRequest(req, { required: true });
  await getSessionOrThrow(sessionId);

  const previousStatus = await getUserAttendanceStatus(sessionId, user.id);

  const { error } = await supabase
    .from("session_attendees")
    .delete()
    .eq("session_id", sessionId)
    .eq("user_id", user.id);
  if (error) {
    throw new AttendanceError(error.message ?? "Failed to update attendance.", 500);
  }

  const counts = await getAttendanceCounts(sessionId);
  return {
    sessionId,
    userId: user.id,
    status: null,
    previousStatus,
    counts,
  };
}

async function parseRequestPayload(req: Request): Promise<RequestPayload> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {};
  }
  try {
    const body = (await req.json()) as RequestPayload;
    return body ?? {};
  } catch {
    return {};
  }
}

function sanitizeId(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function parseStatus(value: string | null | undefined): Exclude<AttendanceStatus, null> {
  const normalized = (value ?? "going").trim().toLowerCase();
  if (normalized === "going" || normalized === "interested") {
    return normalized;
  }
  return "going";
}

async function getUserFromRequest(req: Request, options: { required?: boolean } = {}): Promise<User | null> {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    if (options.required) {
      throw new AttendanceError("Please sign in.", 401);
    }
    return null;
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    if (options.required) {
      throw new AttendanceError("Please sign in.", 401);
    }
    return null;
  }
  return data.user;
}

async function getSessionOrThrow(sessionId: string): Promise<SessionRow> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, max_attendees")
    .eq("id", sessionId)
    .maybeSingle<SessionRow>();
  if (error) {
    throw new AttendanceError(error.message ?? "Failed to load session.", 500);
  }
  if (!data) {
    throw new AttendanceError("Session not found.", 404);
  }
  return data;
}

async function getAttendanceCounts(sessionId: string): Promise<AttendanceCounts> {
  const [going, interested, declined, verified] = await Promise.all([
    countByStatus(sessionId, "going"),
    countByStatus(sessionId, "interested"),
    countByStatus(sessionId, "declined"),
    countVerified(sessionId),
  ]);
  return {
    going,
    interested,
    declined,
    total: going + interested + declined,
    verified,
  };
}

async function countByStatus(sessionId: string, status: Exclude<AttendanceStatus, null>): Promise<number> {
  const { count, error } = await supabase
    .from("session_attendees")
    .select("status", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("status", status);
  if (error) {
    throw new AttendanceError(error.message ?? "Failed to load attendance counts.", 500);
  }
  return count ?? 0;
}

async function countVerified(sessionId: string): Promise<number> {
  const { count, error } = await supabase
    .from("session_attendees")
    .select("checked_in", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("attendance_status", "attended")
    .eq("checked_in", true);
  if (error) {
    throw new AttendanceError(error.message ?? "Failed to load verified count.", 500);
  }
  return count ?? 0;
}

async function getUserAttendanceStatus(sessionId: string, userId: string): Promise<AttendanceStatus> {
  const { data, error } = await supabase
    .from("session_attendees")
    .select("status")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle<SessionAttendeeRow>();
  if (error) {
    throw new AttendanceError(error.message ?? "Failed to load attendance status.", 500);
  }
  return data?.status ?? null;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function handleError(error: unknown) {
  if (error instanceof AttendanceError) {
    return json({ error: error.message }, error.status);
  }
  console.error("[mobile-session-attendance] unexpected error", error);
  const message = error instanceof Error ? error.message : "Unexpected error";
  return json({ error: message }, 500);
}
