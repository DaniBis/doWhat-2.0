import type { SupabaseClient, User } from '@supabase/supabase-js';
import { CORE_VALUES_REQUIRED_COUNT, normalizeCoreValues, ONBOARDING_TRAIT_GOAL } from '@dowhat/shared';

import { isMissingColumnError } from '@/lib/supabase/errors';

export type CoreOnboardingStep = 'traits' | 'values' | 'pledge';

export type CoreOnboardingProgress = {
  traitCount: number;
  coreValues: string[];
  pledgeAckAt: string | null;
  pendingSteps: CoreOnboardingStep[];
};

export const CORE_ONBOARDING_ROUTES: Record<CoreOnboardingStep, string> = {
  traits: '/onboarding/traits',
  values: '/onboarding/core-values',
  pledge: '/onboarding/reliability-pledge',
};

export const sanitizeRedirectPath = (value: string | null | undefined, fallback = '/'): string => {
  if (!value || typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/')) return fallback;
  if (trimmed.startsWith('//')) return fallback;
  return trimmed;
};

export const buildAuthRedirectHref = (redirectTo: string): string =>
  `/auth?redirect=${encodeURIComponent(sanitizeRedirectPath(redirectTo))}`;

export const buildConfirmEmailRedirectHref = (redirectTo: string): string =>
  `/auth/confirm-email?redirect=${encodeURIComponent(sanitizeRedirectPath(redirectTo))}`;

export const buildOnboardingRedirectHref = (step: CoreOnboardingStep, redirectTo: string): string => {
  const path = CORE_ONBOARDING_ROUTES[step];
  const params = new URLSearchParams({ next: sanitizeRedirectPath(redirectTo) });
  return `${path}?${params.toString()}`;
};

export const isEmailConfirmed = (user: User | null | undefined): boolean => {
  if (!user) return false;
  const record = user as User & { email_confirmed_at?: string | null; confirmed_at?: string | null };
  const emailConfirmedAt = record.email_confirmed_at ?? record.confirmed_at ?? null;
  if (typeof emailConfirmedAt === 'string' && emailConfirmedAt.length > 0) return true;

  // OAuth users are typically already verified by the provider.
  const provider = typeof user.app_metadata?.provider === 'string' ? user.app_metadata.provider : null;
  if (provider && provider !== 'email') return true;
  return false;
};

export const deriveCoreOnboardingPendingSteps = (input: {
  traitCount?: number | null;
  coreValues?: unknown;
  pledgeAckAt?: string | null;
}): CoreOnboardingStep[] => {
  const pending: CoreOnboardingStep[] = [];
  const traitCount = typeof input.traitCount === 'number' && Number.isFinite(input.traitCount) ? input.traitCount : 0;
  const coreValues = normalizeCoreValues(input.coreValues);
  const pledgeAckAt = typeof input.pledgeAckAt === 'string' ? input.pledgeAckAt : null;

  if (traitCount < ONBOARDING_TRAIT_GOAL) {
    pending.push('traits');
  }
  if (coreValues.length < CORE_VALUES_REQUIRED_COUNT) {
    pending.push('values');
  }
  if (!pledgeAckAt) {
    pending.push('pledge');
  }

  return pending;
};

type ProfileProgressRow = {
  reliability_pledge_ack_at: string | null;
  core_values?: string[] | null;
};

export const loadCoreOnboardingProgress = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<CoreOnboardingProgress> => {
  let profileRow: ProfileProgressRow | null = null;

  const primaryProfile = await supabase
    .from('profiles')
    .select('reliability_pledge_ack_at,core_values')
    .eq('id', userId)
    .maybeSingle<ProfileProgressRow>();

  if (primaryProfile.error) {
    if (isMissingColumnError(primaryProfile.error, 'core_values')) {
      const fallbackProfile = await supabase
        .from('profiles')
        .select('reliability_pledge_ack_at')
        .eq('id', userId)
        .maybeSingle<{ reliability_pledge_ack_at: string | null }>();
      if (fallbackProfile.error && fallbackProfile.error.code !== 'PGRST116') {
        throw fallbackProfile.error;
      }
      profileRow = fallbackProfile.data
        ? { reliability_pledge_ack_at: fallbackProfile.data.reliability_pledge_ack_at, core_values: [] }
        : null;
    } else if (primaryProfile.error.code !== 'PGRST116') {
      throw primaryProfile.error;
    }
  } else {
    profileRow = primaryProfile.data;
  }

  const traitsCount = await supabase
    .from('user_base_traits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (traitsCount.error && traitsCount.error.code !== 'PGRST116') {
    throw traitsCount.error;
  }

  const traitCount = traitsCount.count ?? 0;
  const coreValues = normalizeCoreValues(profileRow?.core_values ?? []);
  const pledgeAckAt = profileRow?.reliability_pledge_ack_at ?? null;
  const pendingSteps = deriveCoreOnboardingPendingSteps({
    traitCount,
    coreValues,
    pledgeAckAt,
  });

  return {
    traitCount,
    coreValues,
    pledgeAckAt,
    pendingSteps,
  };
};
