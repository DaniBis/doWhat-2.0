import { derivePendingOnboardingSteps, hasCompletedSportStep, ONBOARDING_TRAIT_GOAL } from '../onboarding/progress';

describe('onboarding progress utilities', () => {
  it('returns every onboarding step when nothing is complete', () => {
    const steps = derivePendingOnboardingSteps({ traitCount: 0, primarySport: null, playStyle: null, skillLevel: null, pledgeAckAt: null });
    expect(steps).toEqual(['traits', 'sport', 'pledge']);
  });

  it('keeps the sport step pending until skill level is present', () => {
    const steps = derivePendingOnboardingSteps({
      traitCount: ONBOARDING_TRAIT_GOAL,
      primarySport: 'padel',
      playStyle: 'competitive',
      skillLevel: null,
      pledgeAckAt: '2025-12-01T00:00:00.000Z',
    });
    expect(steps).toEqual(['sport']);
  });

  it('only leaves the pledge step when sport + traits are complete', () => {
    const steps = derivePendingOnboardingSteps({
      traitCount: ONBOARDING_TRAIT_GOAL,
      primarySport: 'padel',
      playStyle: 'competitive',
      skillLevel: '3.0 - Consistent drives',
      pledgeAckAt: null,
    });
    expect(steps).toEqual(['pledge']);
  });

  it('returns an empty list when fully onboarded', () => {
    const steps = derivePendingOnboardingSteps({
      traitCount: ONBOARDING_TRAIT_GOAL,
      primarySport: 'padel',
      playStyle: 'competitive',
      skillLevel: '3.0 - Consistent drives',
      pledgeAckAt: '2025-12-01T00:00:00.000Z',
    });
    expect(steps).toEqual([]);
  });

  it('exposes the sport completion helper', () => {
    expect(hasCompletedSportStep({ primarySport: 'padel', playStyle: 'competitive', skillLevel: '3.0 - Consistent drives' })).toBe(true);
    expect(hasCompletedSportStep({ primarySport: 'padel', playStyle: 'competitive', skillLevel: null })).toBe(false);
    expect(hasCompletedSportStep({ primarySport: 'padel', playStyle: null, skillLevel: '3.0' })).toBe(false);
    expect(hasCompletedSportStep({ primarySport: null, playStyle: 'competitive', skillLevel: '3.0' })).toBe(false);
  });
});
