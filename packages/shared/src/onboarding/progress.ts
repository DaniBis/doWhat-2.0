import { isPlayStyle, isSportType } from '../sports/taxonomy';
import type { OnboardingStep } from '../analytics';
import { REQUIRED_BASE_TRAITS } from '../traits/onboardingReminder';

export type OnboardingProgressInput = {
  traitCount?: number | null;
  primarySport?: string | null;
  playStyle?: string | null;
  skillLevel?: string | null;
  pledgeAckAt?: string | null;
};

const hasValue = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export const hasCompletedSportStep = ({
  primarySport,
  playStyle,
  skillLevel,
}: Pick<OnboardingProgressInput, 'primarySport' | 'playStyle' | 'skillLevel'>): boolean => {
  const normalizedSport = primarySport && isSportType(primarySport) ? primarySport : null;
  const normalizedPlayStyle = playStyle && isPlayStyle(playStyle) ? playStyle : null;
  const normalizedSkill = hasValue(skillLevel) ? skillLevel : null;
  return Boolean(normalizedSport && normalizedPlayStyle && normalizedSkill);
};

export const derivePendingOnboardingSteps = ({
  traitCount,
  primarySport,
  playStyle,
  skillLevel,
  pledgeAckAt,
}: OnboardingProgressInput): OnboardingStep[] => {
  const normalizedTraitCount = typeof traitCount === 'number' && Number.isFinite(traitCount) ? traitCount : 0;
  const pendingSteps: OnboardingStep[] = [];

  if (normalizedTraitCount < REQUIRED_BASE_TRAITS) {
    pendingSteps.push('traits');
  }
  if (!hasCompletedSportStep({ primarySport: primarySport ?? null, playStyle: playStyle ?? null, skillLevel: skillLevel ?? null })) {
    pendingSteps.push('sport');
  }
  if (!pledgeAckAt) {
    pendingSteps.push('pledge');
  }

  return pendingSteps;
};

export { REQUIRED_BASE_TRAITS as ONBOARDING_TRAIT_GOAL } from '../traits/onboardingReminder';
