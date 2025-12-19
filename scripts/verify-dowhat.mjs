#!/usr/bin/env node
import process from "node:process";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import loadEnv from "./utils/load-env.mjs";

loadEnv();

const pickEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const rawSkipFlag = process.env.DOWHAT_HEALTH_SKIP ?? "";
const skipFlag = rawSkipFlag.toLowerCase();
if (["1", "true", "yes"].includes(skipFlag)) {
  console.log("[verify:dowhat] Skipping doWhat verification (DOWHAT_HEALTH_SKIP set).");
  process.exit(0);
}

const supabaseUrl = pickEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL");
const serviceKey = pickEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY");

if (!supabaseUrl || !serviceKey) {
  console.error("[verify:dowhat] Missing Supabase environment. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const pledgeVersion = "dowhat-v1";

const HOSTS = [
  {
    slug: "padel-host",
    email: "mara.padel.host@dowhat.dev",
    fullName: "Mara Popescu",
    primarySport: "padel",
    playStyle: "competitive",
    skillLevel: "4.5 - Competitive club",
  },
  {
    slug: "run-host",
    email: "alex.run.host@dowhat.dev",
    fullName: "Alex Ionescu",
    primarySport: "running",
    playStyle: "fun",
    skillLevel: "Tempo · 5:00/km",
  },
  {
    slug: "climb-host",
    email: "ioana.climb.host@dowhat.dev",
    fullName: "Ioana Dumitru",
    primarySport: "climbing",
    playStyle: "competitive",
    skillLevel: "V4 / 5.11",
  },
];

const VENUES = [
  { slug: "herastrau-padel", name: "Herăstrău Padel Club" },
  { slug: "tineretului-track", name: "Parcul Tineretului Track" },
  { slug: "blocx-bouldering", name: "BlocX Bouldering Gym" },
];

const ACTIVITIES = [
  { slug: "sunrise-padel-rally", sportType: "padel" },
  { slug: "herastrau-run-crew", sportType: "running" },
  { slug: "blocx-boulder-social", sportType: "climbing" },
];

const SESSIONS = [
  {
    slug: "padel-friday-dash",
    hostSlug: "padel-host",
    activitySlug: "sunrise-padel-rally",
    venueSlug: "herastrau-padel",
    visibility: "public",
    openSlot: { slots: 2, requiredSkillLevel: "3.5 - Consistent rallies" },
  },
  {
    slug: "run-saturday-tempo",
    hostSlug: "run-host",
    activitySlug: "herastrau-run-crew",
    venueSlug: "tineretului-track",
    visibility: "public",
    openSlot: { slots: 5, requiredSkillLevel: "Tempo · 5:00/km" },
  },
  {
    slug: "climb-sunday-social",
    hostSlug: "climb-host",
    activitySlug: "blocx-boulder-social",
    venueSlug: "blocx-bouldering",
    visibility: "friends",
    openSlot: { slots: 3, requiredSkillLevel: "V2 / 5.10" },
  },
];

const toHex = (value) => value.toString(16).padStart(2, "0");

const formatUuid = (bytes) => {
  const hex = Array.from(bytes, (byte) => toHex(byte)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const uuidFromSeed = (seed) => {
  const hash = createHash("sha256").update(seed).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
};

const issues = [];
const recordIssue = (message) => {
  issues.push(message);
  console.error(`✗ ${message}`);
};

const hostProfiles = new Map();

const verifyHosts = async () => {
  for (const host of HOSTS) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, full_name, primary_sport, play_style, reliability_pledge_version")
      .eq("full_name", host.fullName)
      .maybeSingle();

    if (error) {
      recordIssue(`profiles: failed to load ${host.fullName} (${error.message})`);
      continue;
    }

    if (!profile) {
      recordIssue(`profiles: missing row for ${host.fullName}`);
      continue;
    }

    hostProfiles.set(host.slug, profile);

    if (profile.primary_sport !== host.primarySport) {
      recordIssue(`profiles: ${host.fullName} primary_sport mismatch (expected ${host.primarySport}, saw ${profile.primary_sport ?? "null"})`);
    }

    if (profile.play_style !== host.playStyle) {
      recordIssue(`profiles: ${host.fullName} play_style mismatch (expected ${host.playStyle}, saw ${profile.play_style ?? "null"})`);
    }

    if (profile.reliability_pledge_version !== pledgeVersion) {
      recordIssue(`profiles: ${host.fullName} pledge version missing (${profile.reliability_pledge_version ?? "null"})`);
    }

    const { data: sportProfiles, error: sportError } = await supabase
      .from("user_sport_profiles")
      .select("sport, skill_level")
      .eq("user_id", profile.id);

    if (sportError) {
      recordIssue(`user_sport_profiles: failed for ${host.fullName} (${sportError.message})`);
      continue;
    }

    const hasSportProfile = (sportProfiles ?? []).some(
      (sport) => sport.sport === host.primarySport && sport.skill_level === host.skillLevel,
    );

    if (!hasSportProfile) {
      recordIssue(`user_sport_profiles: ${host.fullName} missing ${host.primarySport} → ${host.skillLevel}`);
    }
  }
};

const verifyVenues = async () => {
  for (const venue of VENUES) {
    const venueId = uuidFromSeed(`venue:${venue.slug}`);
    const { data, error } = await supabase
      .from("venues")
      .select("id, name")
      .eq("id", venueId)
      .maybeSingle();

    if (error) {
      recordIssue(`venues: failed to load ${venue.slug} (${error.message})`);
      continue;
    }

    if (!data) {
      recordIssue(`venues: missing row for ${venue.slug}`);
      continue;
    }

    if (data.name !== venue.name) {
      recordIssue(`venues: ${venue.slug} name mismatch (expected ${venue.name}, saw ${data.name})`);
    }
  }
};

const verifyActivities = async () => {
  for (const activity of ACTIVITIES) {
    const activityId = uuidFromSeed(`activity:${activity.slug}`);
    const { data, error } = await supabase
      .from("activities")
      .select("id, sport_type, name")
      .eq("id", activityId)
      .maybeSingle();

    if (error) {
      recordIssue(`activities: failed to load ${activity.slug} (${error.message})`);
      continue;
    }

    if (!data) {
      recordIssue(`activities: missing row for ${activity.slug}`);
      continue;
    }

    if (data.sport_type !== activity.sportType) {
      recordIssue(`activities: ${activity.slug} sport_type mismatch (expected ${activity.sportType}, saw ${data.sport_type ?? "null"})`);
    }
  }
};

const verifySessions = async () => {
  for (const session of SESSIONS) {
    const sessionId = uuidFromSeed(`session:${session.slug}`);
    const activityId = uuidFromSeed(`activity:${session.activitySlug}`);
    const venueId = uuidFromSeed(`venue:${session.venueSlug}`);
    const slotId = uuidFromSeed(`session-slot:${session.slug}`);
    const hostProfile = hostProfiles.get(session.hostSlug);

    if (!hostProfile) {
      recordIssue(`sessions: missing host profile for ${session.slug}`);
      continue;
    }

    const { data, error } = await supabase
      .from("sessions")
      .select("id, activity_id, venue_id, host_user_id, visibility")
      .eq("id", sessionId)
      .maybeSingle();

    if (error) {
      recordIssue(`sessions: failed to load ${session.slug} (${error.message})`);
      continue;
    }

    if (!data) {
      recordIssue(`sessions: missing row for ${session.slug}`);
      continue;
    }

    if (data.activity_id !== activityId) {
      recordIssue(`sessions: ${session.slug} activity mismatch`);
    }

    if (data.venue_id !== venueId) {
      recordIssue(`sessions: ${session.slug} venue mismatch`);
    }

    if (data.host_user_id !== hostProfile.id) {
      recordIssue(`sessions: ${session.slug} host mismatch`);
    }

    if (data.visibility !== session.visibility) {
      recordIssue(`sessions: ${session.slug} visibility mismatch (expected ${session.visibility}, saw ${data.visibility ?? "null"})`);
    }

    const { data: slotRow, error: slotError } = await supabase
      .from("session_open_slots")
      .select("session_id, slots_count, required_skill_level")
      .eq("id", slotId)
      .maybeSingle();

    if (slotError) {
      recordIssue(`session_open_slots: failed for ${session.slug} (${slotError.message})`);
    } else if (!slotRow) {
      recordIssue(`session_open_slots: missing row for ${session.slug}`);
    } else {
      if (slotRow.session_id !== sessionId) {
        recordIssue(`session_open_slots: ${session.slug} session mismatch`);
      }
      if (slotRow.slots_count !== session.openSlot.slots) {
        recordIssue(`session_open_slots: ${session.slug} slot count mismatch (expected ${session.openSlot.slots}, saw ${slotRow.slots_count ?? "null"})`);
      }
      const required = session.openSlot.requiredSkillLevel ?? null;
      if ((slotRow.required_skill_level ?? null) !== required) {
        recordIssue(`session_open_slots: ${session.slug} required_skill_level mismatch (expected ${required}, saw ${slotRow.required_skill_level ?? "null"})`);
      }
    }

    const { data: hostAttendee, error: attendeeError } = await supabase
      .from("session_attendees")
      .select("status, attendance_status")
      .eq("session_id", sessionId)
      .eq("user_id", hostProfile.id)
      .maybeSingle();

    if (attendeeError) {
      recordIssue(`session_attendees: failed for ${session.slug} (${attendeeError.message})`);
    } else if (!hostAttendee) {
      recordIssue(`session_attendees: missing host row for ${session.slug}`);
    } else {
      if (hostAttendee.status !== "going") {
        recordIssue(`session_attendees: ${session.slug} host status ≠ going (${hostAttendee.status ?? "null"})`);
      }
      if (hostAttendee.attendance_status !== "registered") {
        recordIssue(
          `session_attendees: ${session.slug} host attendance_status ≠ registered (${hostAttendee.attendance_status ?? "null"})`,
        );
      }
    }
  }
};

const main = async () => {
  console.info("Verifying doWhat pilot data…\n");
  await verifyHosts();
  await verifyVenues();
  await verifyActivities();
  await verifySessions();

  if (issues.length) {
    console.error(`\nVerification completed with ${issues.length} issue(s).`);
    process.exit(1);
  }

  console.info("All doWhat pilot entities look healthy: hosts, venues, activities, sessions, open slots, and host attendance rows are in place.\n");
};

main().catch((error) => {
  console.error("\n[verify:dowhat] Failed:", error);
  process.exit(1);
});
