import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import {
  buildAuthRedirectHref,
  buildConfirmEmailRedirectHref,
  buildOnboardingRedirectHref,
  isEmailConfirmed,
  loadCoreOnboardingProgress,
  sanitizeRedirectPath,
} from './coreAccess';

const isRedirectSignal = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const record = error as { digest?: unknown };
  return typeof record.digest === 'string' && record.digest.startsWith('NEXT_REDIRECT');
};

export const enforceServerCoreAccess = async (redirectTo: string) => {
  const target = sanitizeRedirectPath(redirectTo);
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user ?? null;

  if (!user) {
    redirect(buildAuthRedirectHref(target));
  }

  if (!isEmailConfirmed(user)) {
    redirect(buildConfirmEmailRedirectHref(target));
  }

  try {
    const progress = await loadCoreOnboardingProgress(supabase, user.id);
    const nextStep = progress.pendingSteps[0] ?? null;
    if (nextStep) {
      redirect(buildOnboardingRedirectHref(nextStep, target));
    }
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[core-access] unable to evaluate onboarding progress on server; allowing access', error);
    }
  }

  return { user, supabase };
};
