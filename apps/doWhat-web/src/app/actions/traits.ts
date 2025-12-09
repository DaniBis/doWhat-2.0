"use server";

import { createClient } from "@/lib/supabase/server";
import { TraitSystemError, recordTraitVotes, saveOnboardingTraits } from "@/lib/trait-system";
import { onboardingTraitsSchema, traitVoteSchema } from "@/lib/validation/traits";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";
import type { TraitOnboardingPayload, TraitVoteRequest, TraitVoteResult } from "@/types/traits";

export type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function completeTraitOnboardingAction(
  payload: TraitOnboardingPayload
): Promise<ActionResult> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new TraitSystemError("Unauthorized", 401);
    }
    const parsed = onboardingTraitsSchema.parse(payload);
    await saveOnboardingTraits({ userId: user.id, traitIds: parsed.traitIds }, supabase);
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof TraitSystemError
        ? error.message
        : error instanceof Error
        ? error.message
        : getErrorMessage(error);
    return { ok: false, error: message };
  }
}

export async function submitTraitVotesAction(
  sessionId: string,
  payload: TraitVoteRequest
): Promise<ActionResult<TraitVoteResult>> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new TraitSystemError("Unauthorized", 401);
    }
    const parsed = traitVoteSchema.parse(payload);
    const result = await recordTraitVotes(
      { sessionId, fromUserId: user.id, votes: parsed.votes },
      supabase
    );
    return { ok: true, data: result };
  } catch (error) {
    const message =
      error instanceof TraitSystemError
        ? error.message
        : error instanceof Error
        ? error.message
        : getErrorMessage(error);
    return { ok: false, error: message };
  }
}
