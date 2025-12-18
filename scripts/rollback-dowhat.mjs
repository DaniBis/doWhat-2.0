#!/usr/bin/env node
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { SEED_ACTIVITIES, SEED_SESSIONS, SEED_USERS, SEED_VENUES, uuidFromSeed } from "./dowhat-shared.mjs";

const pickEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const supabaseUrl = pickEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL");
const serviceKey = pickEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY");

if (!supabaseUrl || !serviceKey) {
  console.error("[rollback:dowhat] Missing Supabase environment. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const findUserByEmail = async (email) => {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1, email: normalized });
  if (error) {
    throw new Error(`[auth] listUsers failed for ${email}: ${error.message}`);
  }
  const users = data?.users ?? [];
  const match = users.find((user) => user.email?.toLowerCase() === normalized);
  return match ?? null;
};

const deleteRows = async (table, column, values) => {
  if (values.length === 0) return;
  const { error } = await supabase.from(table).delete().in(column, values);
  if (error) {
    throw new Error(`[${table}] delete failed: ${error.message}`);
  }
};

const deleteSupabaseUsers = async (userIds) => {
  for (const userId of userIds) {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error && error.status !== 404) {
      throw new Error(`[auth] deleteUser failed for ${userId}: ${error.message}`);
    }
  }
};

const main = async () => {
  console.info("Rolling back doWhat pilot data…\n");

  const sessionIds = SEED_SESSIONS.map((session) => uuidFromSeed(`session:${session.slug}`));
  const activityIds = SEED_ACTIVITIES.map((activity) => uuidFromSeed(`activity:${activity.slug}`));
  const venueIds = SEED_VENUES.map((venue) => uuidFromSeed(`venue:${venue.slug}`));

  const pilotUsers = [];
  for (const spec of SEED_USERS) {
    const user = await findUserByEmail(spec.email);
    if (user) {
      pilotUsers.push({ id: user.id, email: spec.email });
    } else {
      console.warn(`• No auth user found for ${spec.email} (skipping user deletion)`);
    }
  }

  await deleteRows("session_attendees", "session_id", sessionIds);
  await deleteRows("session_open_slots", "session_id", sessionIds);
  await deleteRows("sessions", "id", sessionIds);
  await deleteRows("activities", "id", activityIds);
  await deleteRows("venues", "id", venueIds);

  const userIds = pilotUsers.map((user) => user.id);
  await deleteRows("user_sport_profiles", "user_id", userIds);
  await deleteRows("profiles", "id", userIds);

  await deleteSupabaseUsers(userIds);

  console.info("Rollback complete:\n");
  console.info(`• Sessions removed: ${sessionIds.length}`);
  console.info(`• Venues removed: ${venueIds.length}`);
  console.info(`• Activities removed: ${activityIds.length}`);
  console.info(`• Sport profiles cleared: ${userIds.length}`);
  console.info(`• Auth users deleted: ${userIds.length}`);

  console.info("\nYou can now rerun pnpm seed:dowhat to recreate the pilot data.\n");
};

main().catch((error) => {
  console.error("\n[rollback:dowhat] Failed:", error);
  process.exit(1);
});
