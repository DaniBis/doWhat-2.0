"use client";

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase/browser';
import {
  buildAuthRedirectHref,
  buildConfirmEmailRedirectHref,
  buildOnboardingRedirectHref,
  isEmailConfirmed,
  loadCoreOnboardingProgress,
  sanitizeRedirectPath,
} from './coreAccess';

type GuardState = 'checking' | 'allowed';

export const useCoreAccessGuard = (redirectTo: string): GuardState => {
  const router = useRouter();
  const [state, setState] = useState<GuardState>('checking');

  useEffect(() => {
    let active = true;

    const run = async () => {
      const target = sanitizeRedirectPath(redirectTo);
      try {
        const { data } = await supabase.auth.getUser();
        const user = data.user ?? null;

        if (!user) {
          router.replace(buildAuthRedirectHref(target) as Route);
          return;
        }

        if (!isEmailConfirmed(user)) {
          router.replace(buildConfirmEmailRedirectHref(target) as Route);
          return;
        }

        const progress = await loadCoreOnboardingProgress(supabase, user.id);
        const nextStep = progress.pendingSteps[0] ?? null;
        if (nextStep) {
          router.replace(buildOnboardingRedirectHref(nextStep, target) as Route);
          return;
        }

        if (active) {
          setState('allowed');
        }
      } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
          console.warn('[core-access] unable to evaluate onboarding progress in client; allowing access', error);
        }
        if (active) {
          setState('allowed');
        }
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [redirectTo, router]);

  return state;
};
