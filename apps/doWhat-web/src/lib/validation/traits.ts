import { z } from "zod";

export const MAX_ONBOARDING_TRAITS = 5;
export const MAX_VOTE_TRAITS_PER_USER = 3;

export const onboardingTraitsSchema = z.object({
  traitIds: z
    .array(z.string().uuid())
    .length(MAX_ONBOARDING_TRAITS)
    .refine((ids) => new Set(ids).size === MAX_ONBOARDING_TRAITS, {
      message: "Traits must be unique",
    }),
});

export const traitVoteSchema = z.object({
  votes: z
    .array(
      z.object({
        toUserId: z.string().uuid(),
        traits: z
          .array(z.string().uuid())
          .min(1, "Select at least one trait")
          .max(MAX_VOTE_TRAITS_PER_USER)
          .refine((ids) => new Set(ids).size === ids.length, {
            message: "Duplicate traits are not allowed",
          }),
      })
    )
    .min(1, "Provide at least one vote"),
});

export type OnboardingTraitsInput = z.infer<typeof onboardingTraitsSchema>;
export type TraitVoteInput = z.infer<typeof traitVoteSchema>;
