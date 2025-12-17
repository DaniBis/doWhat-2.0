const REQUIRED_BASE_TRAITS = 5;

export type TraitOnboardingStateInput = {
  baseTraitCount: number | null | undefined;
  traitCountLoading: boolean;
};

export type TraitOnboardingState = {
  needsTraitOnboarding: boolean;
  traitShortfall: number;
};

export const getTraitOnboardingState = ({
  baseTraitCount,
  traitCountLoading,
}: TraitOnboardingStateInput): TraitOnboardingState => {
  if (traitCountLoading || baseTraitCount == null) {
    return { needsTraitOnboarding: false, traitShortfall: 0 };
  }

  const shortfall = REQUIRED_BASE_TRAITS - baseTraitCount;
  if (shortfall > 0) {
    return {
      needsTraitOnboarding: true,
      traitShortfall: Math.max(1, shortfall),
    };
  }

  return { needsTraitOnboarding: false, traitShortfall: 0 };
};

export { REQUIRED_BASE_TRAITS };
