import type { Route } from 'next';
import type { OnboardingStep } from '@dowhat/shared';

export const ONBOARDING_STEP_LABELS: Record<OnboardingStep, string> = {
  traits: 'Pick 5 base traits',
  sport: 'Set your sport & skill',
  pledge: 'Confirm the reliability pledge',
};

export const ONBOARDING_STEP_ROUTES = {
  traits: '/onboarding/traits',
  sport: '/onboarding/sports',
  pledge: '/onboarding/reliability-pledge',
} as const satisfies Record<OnboardingStep, Route>;
