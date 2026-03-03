import { isPlayStyle, isSportType } from '../sports/taxonomy';
import type { OnboardingStep } from '../analytics';
import { REQUIRED_BASE_TRAITS } from '../traits/onboardingReminder';
import { CORE_VALUES_REQUIRED_COUNT, normalizeCoreValues } from './coreValues';

export type OnboardingProgressInput = {
  traitCount?: number | null;
  coreValues?: unknown;
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
  coreValues,
  primarySport,
  playStyle,
  skillLevel,
  pledgeAckAt,
}: OnboardingProgressInput): OnboardingStep[] => {
  const normalizedTraitCount = typeof traitCount === 'number' && Number.isFinite(traitCount) ? traitCount : 0;
  const normalizedCoreValues = normalizeCoreValues(coreValues);
  const pendingSteps: OnboardingStep[] = [];

  if (normalizedTraitCount < REQUIRED_BASE_TRAITS) {
    pendingSteps.push('traits');
  }
  if (normalizedCoreValues.length < CORE_VALUES_REQUIRED_COUNT) {
    pendingSteps.push('values');
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
