#!/usr/bin/env node
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminKey = process.env.NOTIFICATION_ADMIN_KEY;
const stubRecipient = process.env.NOTIFICATION_TWILIO_STUB_TO ?? "+15005550006";

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is required");
}
if (!serviceKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}
if (!adminKey) {
  throw new Error("NOTIFICATION_ADMIN_KEY is required to call notify-sms");
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const functionsBaseUrl = process.env.SUPABASE_FUNCTIONS_URL ?? `${supabaseUrl.replace(/\/$/, "")}/functions/v1`;

const notifySmsUrl = `${functionsBaseUrl}/notify-sms`;

const log = (label, value) => {
  // eslint-disable-next-line no-console
  console.log(`[manual-notify-sms] ${label}`, value);
};

log("notify-sms URL", notifySmsUrl);

async function pickSession() {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, host_user_id, description, starts_at")
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error("No sessions available to seed notification outbox");
  }
  return data;
}

async function pickAttendee(excludeUserId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .neq("id", excludeUserId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error("No attendee profile found to pair with the session");
  }
  return data;
}

async function seedOutboxRow({ session, attendee }) {
  const dedupeKey = `manual_attendee_joined:${session.id}:${attendee.id}:${Date.now()}`;
  const payload = {
    session_id: session.id,
    attendee_user_id: attendee.id,
    attendance_status: "going",
    joined_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("notification_outbox")
    .insert({
      event_type: "attendee_joined",
      session_id: session.id,
      host_user_id: session.host_user_id,
      attendee_user_id: attendee.id,
      recipient_phone: stubRecipient,
      payload,
      status: "pending",
      dedupe_key: dedupeKey,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function invokeNotifySms() {
  const response = await fetch(notifySmsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminKey}`,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`notify-sms failed (${response.status}): ${body?.error ?? "unknown"}`);
  }
  return body;
}

async function fetchOutboxRow(id) {
  const { data, error } = await supabase
    .from("notification_outbox")
    .select("status, attempt_count, last_error, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function main() {
  const session = await pickSession();
  const attendee = await pickAttendee(session.host_user_id);
  log("Selected session", { id: session.id, host: session.host_user_id, starts_at: session.starts_at });
  log("Selected attendee", attendee);

  const inserted = await seedOutboxRow({ session, attendee });
  log("Seeded notification_outbox row", inserted.id);

  const notifyResult = await invokeNotifySms();
  log("notify-sms response", notifyResult);

  const finalRow = await fetchOutboxRow(inserted.id);
  log("Outbox row after notify-sms", finalRow);
}

main().catch((error) => {
  console.error("[manual-notify-sms] Error", error);
  process.exit(1);
});
