#!/usr/bin/env node
import process from "node:process";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  pledgeVersion,
  SEED_ACTIVITIES,
  SEED_SESSIONS,
  SEED_USERS,
  SEED_VENUES,
  uuidFromSeed,
} from "./social-sweat-shared.mjs";

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
  console.error("[seed:social-sweat] Missing Supabase environment. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const basePassword = process.env.SOCIAL_SWEAT_SEED_PASSWORD?.trim();

const randomPassword = () => `Sweat-${randomBytes(4).toString("hex")}-${Date.now().toString(36)}`;

const findUserByEmail = async (email) => {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`[auth] listUsers failed: ${error.message}`);
    }
    const users = data?.users ?? [];
    const match = users.find((user) => user.email?.toLowerCase() === normalized);
    if (match) {
      return match;
    }
    if (users.length < perPage) {
      return null;
    }
    page += 1;
  }
};

const ensureUser = async (spec) => {
  const existing = await findUserByEmail(spec.email);
  if (existing) {
    return { user: existing, created: false, password: undefined };
  }
  const password = spec.password ?? basePassword ?? randomPassword();
  const { data, error } = await supabase.auth.admin.createUser({
    email: spec.email,
    password,
    email_confirm: true,
  });
  if (error || !data?.user) {
    if (error) {
      console.error("[seed:social-sweat] createUser debug", {
        message: error.message,
        status: error.status,
        error_description: error.error_description,
        details: error.details,
        hint: error.hint,
      });
      console.error("[seed:social-sweat] createUser debug raw", error);
    }
    throw new Error(
      `[auth] createUser failed for ${spec.email}: ${error?.message ?? "unknown error"}${
        error?.status ? ` (status ${error.status})` : ""
      }`,
    );
  }
  return { user: data.user, created: true, password };
};

const upsertProfile = async (userId, spec) => {
  const payload = {
    id: userId,
    user_id: userId,
    full_name: spec.fullName,
    primary_sport: spec.primarySport,
    play_style: spec.playStyle,
    reliability_score: spec.reliabilityScore,
    availability_window: spec.availabilityWindow,
    last_lat: spec.homeBase.lat,
    last_lng: spec.homeBase.lng,
    reliability_pledge_ack_at: new Date().toISOString(),
    reliability_pledge_version: pledgeVersion,
  };
  const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
  if (error) {
    throw new Error(`[profiles] upsert failed for ${spec.email}: ${error.message}`);
  }
};

const upsertSportProfiles = async (userId, spec) => {
  for (const sport of spec.sportProfiles) {
    const payload = {
      id: uuidFromSeed(`sport-profile:${userId}:${sport.sport}`),
      user_id: userId,
      sport: sport.sport,
      skill_level: sport.skillLevel,
    };
    const { error } = await supabase
      .from("user_sport_profiles")
      .upsert(payload, { onConflict: "user_id,sport" });
    if (error) {
      throw new Error(`[user_sport_profiles] upsert failed for ${spec.email}: ${error.message}`);
    }
  }
};

const upsertVenue = async (spec) => {
  const payload = {
    id: uuidFromSeed(`venue:${spec.slug}`),
    name: spec.name,
    address: spec.address,
    lat: spec.lat,
    lng: spec.lng,
    needs_verification: false,
  };
  const { data, error } = await supabase.from("venues").upsert(payload, { onConflict: "id" }).select("id").single();
  if (error || !data) {
    throw new Error(`[venues] upsert failed for ${spec.slug}: ${error?.message ?? "no data"}`);
  }
  return data.id;
};

const upsertActivity = async (spec) => {
  const payload = {
    id: uuidFromSeed(`activity:${spec.slug}`),
    name: spec.name,
    description: spec.description,
    sport_type: spec.sportType,
  };
  const { data, error } = await supabase
    .from("activities")
    .upsert(payload, { onConflict: "id" })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`[activities] upsert failed for ${spec.slug}: ${error?.message ?? "no data"}`);
  }
  return data.id;
};

const upsertSession = async (spec, deps) => {
  const sessionId = uuidFromSeed(`session:${spec.slug}`);
  const startsAt = new Date(Date.now() + spec.startsInHours * 60 * 60 * 1000);
  const durationMs = spec.durationMinutes * 60 * 1000;
  const endsAt = new Date(startsAt.getTime() + durationMs);
  const description = spec.description ?? "doWhat pilot session";
  const payload = {
    id: sessionId,
    activity_id: deps.activityId,
    venue_id: deps.venueId,
    host_user_id: deps.hostUserId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    price_cents: spec.priceCents ?? deps.defaultPriceCents ?? 0,
    visibility: spec.visibility ?? "public",
    max_attendees: spec.maxAttendees ?? 10,
    description,
  };
  const { error } = await supabase.from("sessions").upsert(payload, { onConflict: "id" });
  if (error) {
    throw new Error(`[sessions] upsert failed for ${spec.slug}: ${error.message}`);
  }

  const slotPayload = {
    id: uuidFromSeed(`session-slot:${spec.slug}`),
    session_id: sessionId,
    slots_count: spec.openSlot.slots,
    required_skill_level: spec.openSlot.requiredSkillLevel ?? null,
  };
  const { error: slotError } = await supabase
    .from("session_open_slots")
    .upsert(slotPayload, { onConflict: "session_id" });
  if (slotError) {
    throw new Error(`[session_open_slots] upsert failed for ${spec.slug}: ${slotError.message}`);
  }

  const attendeePayload = {
    session_id: sessionId,
    user_id: deps.hostUserId,
    status: "going",
    attendance_status: "registered",
  };
  const { error: attendeeError } = await supabase
    .from("session_attendees")
    .upsert(attendeePayload, { onConflict: "session_id,user_id" });
  if (attendeeError) {
    throw new Error(`[session_attendees] upsert failed for ${spec.slug}: ${attendeeError.message}`);
  }

  return { id: sessionId, startsAt, endsAt };
};

const main = async () => {
  console.info("Seeding doWhat pilot data for Bucharest…\n");

  const userIdByEmail = new Map();
  const passwordByEmail = new Map();

  for (const userSpec of SEED_USERS) {
    const result = await ensureUser(userSpec);
    userIdByEmail.set(userSpec.email.toLowerCase(), result.user.id);
    if (result.password) {
      passwordByEmail.set(userSpec.email.toLowerCase(), result.password);
    }
    await upsertProfile(result.user.id, userSpec);
    await upsertSportProfiles(result.user.id, userSpec);
  }

  const venueIdBySlug = new Map();
  for (const venue of SEED_VENUES) {
    const id = await upsertVenue(venue);
    venueIdBySlug.set(venue.slug, id);
  }

  const activityInfoBySlug = new Map();
  for (const activity of SEED_ACTIVITIES) {
    const id = await upsertActivity(activity);
    activityInfoBySlug.set(activity.slug, { id, defaultPrice: activity.defaultPriceCents });
  }

  const sessionResults = [];
  for (const session of SEED_SESSIONS) {
    const hostId = userIdByEmail.get(session.hostEmail.toLowerCase());
    const venueId = venueIdBySlug.get(session.venueSlug);
    const activityInfo = activityInfoBySlug.get(session.activitySlug);
    if (!hostId) {
      throw new Error(`Missing host for ${session.slug}`);
    }
    if (!venueId) {
      throw new Error(`Missing venue for ${session.slug}`);
    }
    if (!activityInfo) {
      throw new Error(`Missing activity for ${session.slug}`);
    }
    const result = await upsertSession(session, {
      hostUserId: hostId,
      venueId,
      activityId: activityInfo.id,
      defaultPriceCents: activityInfo.defaultPrice,
    });
    sessionResults.push(result);
  }

  console.info("doWhat seed complete:\n");
  console.info(`• Hosts ensured: ${SEED_USERS.length}`);
  if (passwordByEmail.size) {
    console.info("  Newly created users:");
    for (const [email, password] of passwordByEmail.entries()) {
      console.info(`    - ${email} / ${password}`);
    }
  }
  console.info(`• Venues upserted: ${SEED_VENUES.length}`);
  console.info(`• Activities upserted: ${SEED_ACTIVITIES.length}`);
  console.info(`• Sessions active: ${sessionResults.length}`);
  sessionResults.forEach((session) => {
    console.info(
      `    - ${session.id} | ${session.startsAt.toLocaleString("ro-RO", { hour12: false })} → ${session.endsAt.toLocaleTimeString("ro-RO", { hour12: false })}`,
    );
  });

  console.info("\nOpen-slot cards should appear once the mobile client refreshes the home feed.\n");
};

main().catch((error) => {
  console.error("\n[seed:social-sweat] Failed:", error);
  process.exit(1);
});
