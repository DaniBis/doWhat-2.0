import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";
import type { Database, TraitRow, RsvpRow } from "@/types/database";
import type { TraitOption, TraitSummary, TraitVoteRequest, TraitVoteResult } from "@/types/traits";
import { MAX_ONBOARDING_TRAITS, MAX_VOTE_TRAITS_PER_USER } from "@/lib/validation/traits";

const VOTE_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours

type TypedClient = SupabaseClient<Database>;

type VoteInput = TraitVoteRequest["votes"];

type SummaryRow = {
  score: number;
  base_count: number;
  vote_count: number;
  updated_at: string;
  traits: TraitRow | TraitRow[] | null;
};

export class TraitSystemError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function getClient(client?: TypedClient) {
  return client ?? createClient<Database>();
}

function normalizeIds(ids: string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()))).filter(Boolean);
}

async function assertTraitIdsExist(ids: string[], supabase: TypedClient) {
  if (!ids.length) return;
  const { data, error } = await supabase.from("traits").select("id").in("id", ids);
  if (error) {
    throw new TraitSystemError(getErrorMessage(error), 500);
  }
  const received = new Set((data ?? []).map((row) => row.id));
  ids.forEach((id) => {
    if (!received.has(id)) {
      throw new TraitSystemError("One of the submitted traits does not exist", 404);
    }
  });
}

export async function fetchTraitCatalog(client?: TypedClient): Promise<TraitOption[]> {
  const supabase = getClient(client);
  const { data, error } = await supabase
    .from("traits")
    .select("id, name, color, icon")
    .order("name", { ascending: true });
  if (error) {
    throw new TraitSystemError(getErrorMessage(error), 500);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
  }));
}

export async function saveOnboardingTraits(
  { userId, traitIds }: { userId: string; traitIds: string[] },
  client?: TypedClient
) {
  const supabase = getClient(client);
  const unique = normalizeIds(traitIds);
  if (unique.length !== MAX_ONBOARDING_TRAITS) {
    throw new TraitSystemError(`Exactly ${MAX_ONBOARDING_TRAITS} traits are required`, 400);
  }
  await assertTraitIdsExist(unique, supabase);

  const { error: deleteError } = await supabase.from("user_base_traits").delete().eq("user_id", userId);
  if (deleteError) {
    throw new TraitSystemError(getErrorMessage(deleteError), 500);
  }

  const insertPayload = unique.map((traitId) => ({ user_id: userId, trait_id: traitId }));
  const { error: insertError } = await supabase.from("user_base_traits").insert(insertPayload);
  if (insertError) {
    throw new TraitSystemError(getErrorMessage(insertError), 500);
  }

  await Promise.all(
    unique.map(async (traitId) => {
      const { error: rpcError } = await supabase.rpc("increment_user_trait_score", {
        p_user: userId,
        p_trait: traitId,
        p_score_delta: 3,
        p_base_delta: 1,
        p_vote_delta: 0,
      });
      if (rpcError) {
        throw new TraitSystemError(getErrorMessage(rpcError), 500);
      }
    })
  );
}

export async function getUserTraitSummary(
  { userId, limit }: { userId: string; limit?: number },
  client?: TypedClient
): Promise<TraitSummary[]> {
  const supabase = getClient(client);
  const cappedLimit = limit ? Math.max(1, Math.min(limit, 24)) : undefined;
  const query = supabase
    .from("user_trait_summary")
    .select("score, base_count, vote_count, updated_at, traits:trait_id(id, name, color, icon)")
    .eq("user_id", userId)
    .order("score", { ascending: false });
  if (cappedLimit) {
    query.limit(cappedLimit);
  }
  const { data, error } = await query;
  if (error) {
    throw new TraitSystemError(getErrorMessage(error), 500);
  }
  return ((data ?? []) as SummaryRow[])
    .map((row) => ({
      score: row.score,
      base_count: row.base_count,
      vote_count: row.vote_count,
      updated_at: row.updated_at,
      trait: Array.isArray(row.traits) ? row.traits[0] : row.traits,
    }))
    .filter((row) => Boolean(row.trait))
    .map((row) => ({
      id: row.trait!.id,
      name: row.trait!.name,
      color: row.trait!.color,
      icon: row.trait!.icon,
      score: row.score,
      baseCount: row.base_count,
      voteCount: row.vote_count,
      updatedAt: row.updated_at,
    }));
}

async function ensureSessionWindow(sessionId: string, supabase: TypedClient) {
  const { data, error } = await supabase.from("sessions").select("id, ends_at").eq("id", sessionId).maybeSingle();
  if (error) {
    throw new TraitSystemError(getErrorMessage(error), 500);
  }
  if (!data) {
    throw new TraitSystemError("Session not found", 404);
  }
  if (!data.ends_at) {
    throw new TraitSystemError("Session is missing an end time", 422);
  }
  const endsAt = new Date(data.ends_at).getTime();
  if (Number.isNaN(endsAt)) {
    throw new TraitSystemError("Session end time is invalid", 422);
  }
  if (Date.now() - endsAt < VOTE_DELAY_MS) {
    throw new TraitSystemError("Votes unlock 24 hours after the session ends", 409);
  }
}

type AttendanceRow = Pick<RsvpRow, "user_id" | "status">;

async function loadSessionAttendance(sessionId: string, supabase: TypedClient) {
  const { data, error } = await supabase
    .from("rsvps")
    .select("user_id, status")
    .eq("session_id", sessionId);
  if (error) {
    throw new TraitSystemError(getErrorMessage(error), 500);
  }
  const attendance = new Map<string, AttendanceRow>();
  (data ?? []).forEach((row) => {
    attendance.set(row.user_id, row as AttendanceRow);
  });
  return attendance;
}

function sanitizeVotes(votes: VoteInput, fromUserId: string, attendance: Map<string, AttendanceRow>) {
  if (!votes.length) {
    throw new TraitSystemError("No votes provided", 400);
  }
  const seenTargets = new Set<string>();
  return votes.map(({ toUserId, traits }) => {
    const target = toUserId.trim();
    if (target === fromUserId) {
      throw new TraitSystemError("You cannot vote for yourself", 400);
    }
    if (!attendance.has(target) || attendance.get(target)?.status !== "going") {
      throw new TraitSystemError("Votes are limited to co-attendees", 400);
    }
    if (seenTargets.has(target)) {
      throw new TraitSystemError("Duplicate recipients detected", 400);
    }
    seenTargets.add(target);
    const uniqueTraits = normalizeIds(traits);
    if (!uniqueTraits.length) {
      throw new TraitSystemError("Select at least one trait per recipient", 400);
    }
    if (uniqueTraits.length > MAX_VOTE_TRAITS_PER_USER) {
      throw new TraitSystemError(`Only ${MAX_VOTE_TRAITS_PER_USER} traits per person are allowed`, 400);
    }
    return { toUserId: target, traits: uniqueTraits };
  });
}

export async function recordTraitVotes(
  { sessionId, fromUserId, votes }: { sessionId: string; fromUserId: string; votes: VoteInput },
  client?: TypedClient
): Promise<TraitVoteResult> {
  const supabase = getClient(client);
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new TraitSystemError("Missing session reference", 400);
  }
  await ensureSessionWindow(normalizedSessionId, supabase);
  const attendance = await loadSessionAttendance(normalizedSessionId, supabase);
  if (!attendance.has(fromUserId) || attendance.get(fromUserId)?.status !== "going") {
    throw new TraitSystemError("Only attendees can submit votes", 403);
  }
  const sanitizedVotes = sanitizeVotes(votes, fromUserId, attendance);
  const allTraitIds = normalizeIds(sanitizedVotes.flatMap((vote) => vote.traits));
  await assertTraitIdsExist(allTraitIds, supabase);

  const existingVotes = await supabase
    .from("user_trait_votes")
    .select("id", { head: true, count: "exact" })
    .eq("session_id", normalizedSessionId)
    .eq("from_user", fromUserId);
  if (existingVotes.error) {
    throw new TraitSystemError(getErrorMessage(existingVotes.error), 500);
  }
  if ((existingVotes.count ?? 0) > 0) {
    throw new TraitSystemError("You already submitted votes for this session", 409);
  }

  const rows = sanitizedVotes.flatMap((vote) =>
    vote.traits.map((traitId) => ({
      to_user: vote.toUserId,
      from_user: fromUserId,
      session_id: normalizedSessionId,
      trait_id: traitId,
    }))
  );
  if (!rows.length) {
    throw new TraitSystemError("No traits to record", 400);
  }
  const { error: insertError } = await supabase.from("user_trait_votes").insert(rows);
  if (insertError) {
    throw new TraitSystemError(getErrorMessage(insertError), 400);
  }

  const increments = new Map<string, { userId: string; traitId: string; count: number }>();
  rows.forEach((row) => {
    const key = `${row.to_user}:${row.trait_id}`;
    const entry = increments.get(key) ?? { userId: row.to_user, traitId: row.trait_id, count: 0 };
    entry.count += 1;
    increments.set(key, entry);
  });
  await Promise.all(
    Array.from(increments.values()).map(async ({ userId, traitId, count }) => {
      const { error: rpcError } = await supabase.rpc("increment_user_trait_score", {
        p_user: userId,
        p_trait: traitId,
        p_score_delta: count,
        p_vote_delta: count,
        p_base_delta: 0,
      });
      if (rpcError) {
        throw new TraitSystemError(getErrorMessage(rpcError), 500);
      }
    })
  );

  return { sessionId: normalizedSessionId, votesInserted: rows.length };
}
