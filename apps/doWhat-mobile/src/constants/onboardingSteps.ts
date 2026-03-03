import { REQUIRED_BASE_TRAITS, type OnboardingStep } from '@dowhat/shared';

export const TRAIT_GOAL = REQUIRED_BASE_TRAITS;

export const STEP_LABELS: Record<OnboardingStep, string> = {
  traits: 'Pick 5 base traits',
  values: 'Add 3 core values',
  sport: 'Set your sport & skill',
  pledge: 'Confirm the reliability pledge',
};

export const STEP_ROUTES: Record<OnboardingStep, string> = {
  traits: '/onboarding-traits',
  values: '/onboarding/core-values',
  sport: '/onboarding/sports',
  pledge: '/onboarding/reliability-pledge',
};
