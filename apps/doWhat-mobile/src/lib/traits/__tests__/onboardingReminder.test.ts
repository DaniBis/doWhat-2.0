import { describe, it, expect } from '@jest/globals';

import { getTraitOnboardingState, REQUIRED_BASE_TRAITS } from '@dowhat/shared';

describe('getTraitOnboardingState', () => {
  it('hides the CTA while the count is loading', () => {
    const state = getTraitOnboardingState({ baseTraitCount: 2, traitCountLoading: true });
    expect(state).toEqual({ needsTraitOnboarding: false, traitShortfall: 0 });
  });

  it('hides the CTA when no count is available yet', () => {
    const state = getTraitOnboardingState({ baseTraitCount: null, traitCountLoading: false });
    expect(state.needsTraitOnboarding).toBe(false);
    expect(state.traitShortfall).toBe(0);
  });

  it('returns the shortfall when under the required trait threshold', () => {
    const state = getTraitOnboardingState({ baseTraitCount: 3, traitCountLoading: false });
    expect(state.needsTraitOnboarding).toBe(true);
    expect(state.traitShortfall).toBe(REQUIRED_BASE_TRAITS - 3);
  });

  it('hides the CTA once users reach the required trait count', () => {
    const state = getTraitOnboardingState({ baseTraitCount: REQUIRED_BASE_TRAITS, traitCountLoading: false });
    expect(state).toEqual({ needsTraitOnboarding: false, traitShortfall: 0 });
  });
});
