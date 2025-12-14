// Supabase Edge Function: notify-sms
// Polls notification_outbox for pending attendee_joined events and sends Twilio SMS alerts.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { assertValidTwilioConfig, sendTwilioSms, TwilioConfig } from "./twilio.ts";

type NotificationOutboxRow = {
  id: string;
  event_type: string;
  session_id: string;
  host_user_id: string;
  attendee_user_id: string;
  recipient_phone: string | null;
  payload: Record<string, unknown>;
  status: string;
  dedupe_key: string;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  id: string;
  starts_at: string | null;
  venue_id: string | null;
  description: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? undefined;
const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN") ?? undefined;
const twilioFromNumber = Deno.env.get("TWILIO_FROM_NUMBER") ?? undefined;
const twilioStubMode = (Deno.env.get("NOTIFICATION_TWILIO_STUB") ?? "false").toLowerCase() === "true";
const twilioStubRecipient = Deno.env.get("NOTIFICATION_TWILIO_STUB_TO") ?? "+15005550006"; // Twilio magic test number
const batchSize = Number(Deno.env.get("NOTIFICATION_BATCH_SIZE") ?? "20");
const maxAttempts = Number(Deno.env.get("NOTIFICATION_MAX_ATTEMPTS") ?? "3");
const perSessionWindowMinutes = Number(Deno.env.get("NOTIFICATION_SESSION_WINDOW_MINUTES") ?? "60");
const perSessionMaxSends = Number(Deno.env.get("NOTIFICATION_SESSION_MAX_PER_WINDOW") ?? "5");

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured");
}

const twilioConfig: TwilioConfig = {
  stubMode: twilioStubMode,
  stubRecipient: twilioStubRecipient,
  accountSid: twilioAccountSid ?? null,
  authToken: twilioAuthToken ?? null,
  fromNumber: twilioFromNumber ?? null,
};

assertValidTwilioConfig(twilioConfig);

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const expectedKey = Deno.env.get("NOTIFICATION_ADMIN_KEY");
  if (expectedKey && apiKey !== expectedKey) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const pending = await fetchPendingOutboxRows();
    const outcomes = [] as Array<Record<string, unknown>>;

    for (const row of pending) {
      const result = await processOutboxRow(row);
      outcomes.push(result);
    }

    return new Response(
      JSON.stringify({ processed: outcomes.length, outcomes }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("notify-sms error", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function fetchPendingOutboxRows(): Promise<NotificationOutboxRow[]> {
  const { data, error } = await supabase
    .from<NotificationOutboxRow>("notification_outbox")
    .select("*")
    .eq("status", "pending")
    .lt("attempt_count", maxAttempts)
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function processOutboxRow(row: NotificationOutboxRow) {
  try {
    if (!row.recipient_phone) {
      await markFailed(row.id, row.attempt_count, "missing recipient phone");
      return { id: row.id, status: "skipped", reason: "missing_recipient" };
    }

    if (await isRateLimited(row)) {
      await setLastError(row.id, "rate_limited_window");
      return { id: row.id, status: "rate_limited" };
    }

    const message = await buildSmsBody(row);
    await sendTwilioSms(row.recipient_phone, message, twilioConfig);
    await markSent(row.id, row.attempt_count);
    return { id: row.id, status: "sent" };
  } catch (error) {
    await markPending(row.id, row.attempt_count, (error as Error).message);
    return { id: row.id, status: "error", error: (error as Error).message };
  }
}

async function buildSmsBody(row: NotificationOutboxRow): Promise<string> {
  const [session, attendee] = await Promise.all([
    fetchSession(row.session_id),
    fetchProfile(row.attendee_user_id),
  ]);

  const attendeeName = attendee?.full_name?.trim()?.split(" ")[0] ?? "Someone";
  const startsAt = session?.starts_at ? new Date(session.starts_at) : null;
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const sessionTime = startsAt ? timeFormatter.format(startsAt) : "an upcoming session";
  const summary = session?.description ? session.description.split("\n")[0] : "your session";

  return `${attendeeName} just joined ${summary} (${sessionTime}). Check the Social Sweat roster for details.`;
}

async function fetchSession(sessionId: string): Promise<SessionRow | null> {
  const { data, error } = await supabase
    .from<SessionRow>("sessions")
    .select("id, starts_at, venue_id, description")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data;
}

async function fetchProfile(profileId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from<ProfileRow>("profiles")
    .select("id, full_name")
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data;
}

async function isRateLimited(row: NotificationOutboxRow): Promise<boolean> {
  const windowStart = new Date(Date.now() - perSessionWindowMinutes * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("notification_outbox")
    .select("id", { count: "exact", head: true })
    .eq("session_id", row.session_id)
    .eq("event_type", row.event_type)
    .eq("status", "sent")
    .gte("updated_at", windowStart);

  if (error) {
    throw error;
  }

  return (count ?? 0) >= perSessionMaxSends;
}

async function markSent(id: string, attemptCount: number) {
  const { error } = await supabase
    .from("notification_outbox")
    .update({ status: "sent", attempt_count: attemptCount + 1, last_error: null })
    .eq("id", id);

  if (error) {
    throw error;
  }
}

async function markPending(id: string, attemptCount: number, message: string) {
  const nextAttempt = attemptCount + 1;
  const status = nextAttempt >= maxAttempts ? "failed" : "pending";

  const { error } = await supabase
    .from("notification_outbox")
    .update({
      status,
      attempt_count: nextAttempt,
      last_error: message,
    })
    .eq("id", id);

  if (error) {
    throw error;
  }
}

async function markFailed(id: string, attemptCount: number, message: string) {
  const { error } = await supabase
    .from("notification_outbox")
    .update({
      status: "failed",
      attempt_count: Math.max(attemptCount + 1, attemptCount),
      last_error: message,
    })
    .eq("id", id);

  if (error) {
    throw error;
  }
}

async function setLastError(id: string, message: string) {
  const { error } = await supabase
    .from("notification_outbox")
    .update({ last_error: message })
    .eq("id", id);

  if (error) {
    throw error;
  }
}
