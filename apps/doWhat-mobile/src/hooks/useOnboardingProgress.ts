import { useCallback, useEffect, useRef, useState } from 'react';
import { derivePendingOnboardingSteps, isPlayStyle, isSportType, type OnboardingStep, type PlayStyle, type SportType } from '@dowhat/shared';
import { supabase } from '../lib/supabase';
import { maybeResetInvalidSession } from '../lib/auth';

const normalizeMessage = (error: unknown, fallback: string) => {
  if (!error) return fallback;
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
};

type SupabaseErrorLike = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
};

const extractSupabaseErrorMeta = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return { message: '', code: null as string | null, details: null as string | null, hint: null as string | null, status: null as number | null };
  }
  const payload = error as SupabaseErrorLike;
  const toString = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);
  const toNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  return {
    message: toString(payload.message) ?? '',
    code: toString(payload.code),
    details: toString(payload.details),
    hint: toString(payload.hint),
    status: toNumber(payload.status),
  };
};

const logSupabaseError = (context: string, error: unknown) => {
  const meta = extractSupabaseErrorMeta(error);
  console.warn(`[useOnboardingProgress] ${context} failed`, meta);
};

type ProfileProgressRow = {
  primary_sport: string | null;
  play_style: string | null;
  reliability_pledge_ack_at: string | null;
};

type SportProfileRow = {
  skill_level: string | null;
};

const fetchSportSkillLevel = async (userId: string, sport: SportType | null) => {
  if (!sport) return null;
  const { data, error } = await supabase
    .from('user_sport_profiles')
    .select('skill_level')
    .eq('user_id', userId)
    .eq('sport', sport)
    .maybeSingle<SportProfileRow>();
  if (error && error.code !== 'PGRST116') throw error;
  return data?.skill_level ?? null;
};

export type UseOnboardingProgressResult = {
  loading: boolean;
  hydrated: boolean;
  pendingSteps: OnboardingStep[];
  prioritizedStep: OnboardingStep | null;
  error: string | null;
  refresh: () => Promise<void>;
};

export const useOnboardingProgress = (): UseOnboardingProgressResult => {
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingSteps, setPendingSteps] = useState<OnboardingStep[]>([]);
  const [prioritizedStep, setPrioritizedStep] = useState<OnboardingStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        if (!mountedRef.current) return;
        setPendingSteps([]);
        setPrioritizedStep(null);
        return;
      }

      const traitsPromise = supabase
        .from('user_base_traits')
        .select('trait_id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      const profilePromise = supabase
        .from('profiles')
        .select('primary_sport, play_style, reliability_pledge_ack_at')
        .eq('id', user.id)
        .maybeSingle<ProfileProgressRow>();

      const [traitsResult, profileResult] = await Promise.all([traitsPromise, profilePromise]);

      if (traitsResult.error && traitsResult.error.code !== 'PGRST116') {
        logSupabaseError('user_base_traits query', traitsResult.error);
        throw traitsResult.error;
      }
      if (profileResult.error && profileResult.error.code !== 'PGRST116') {
        logSupabaseError('profiles query', profileResult.error);
        throw profileResult.error;
      }

      const traitCount = typeof traitsResult.count === 'number' ? traitsResult.count : 0;
      const normalizedSport = profileResult.data?.primary_sport && isSportType(profileResult.data.primary_sport)
        ? (profileResult.data.primary_sport as SportType)
        : null;
      const normalizedPlayStyle = profileResult.data?.play_style && isPlayStyle(profileResult.data.play_style)
        ? (profileResult.data.play_style as PlayStyle)
        : null;
      let skillLevel: string | null = null;
      try {
        skillLevel = await fetchSportSkillLevel(user.id, normalizedSport);
      } catch (skillError) {
        logSupabaseError('user_sport_profiles query', skillError);
        throw skillError;
      }
      const steps = derivePendingOnboardingSteps({
        traitCount,
        primarySport: normalizedSport,
        playStyle: normalizedPlayStyle,
        skillLevel,
        pledgeAckAt: profileResult.data?.reliability_pledge_ack_at ?? null,
      });

      if (!mountedRef.current) return;
      setPendingSteps(steps);
      setPrioritizedStep(steps[0] ?? null);
    } catch (err) {
      const meta = extractSupabaseErrorMeta(err);
      const log = __DEV__ ? console.warn : console.log;
      if (__DEV__) {
        console.groupCollapsed?.('[useOnboardingProgress] refresh failed');
        log('[useOnboardingProgress] failed to load progress', err, meta);
        console.trace('[useOnboardingProgress] stack trace');
        console.groupEnd?.();
      } else {
        log('[useOnboardingProgress] failed to load progress', err, meta);
      }
      const reset = await maybeResetInvalidSession(err);
      if (!mountedRef.current) return;
      setPendingSteps([]);
      setPrioritizedStep(null);
      const fallback = reset ? 'Session expired. Please sign in again.' : 'Could not load onboarding progress.';
      const bestMessage = meta.message || meta.details || meta.hint || '';
      setError(normalizeMessage(bestMessage || err, fallback));
    } finally {
      if (!mountedRef.current) return;
      setHydrated(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    loading,
    hydrated,
    pendingSteps,
    prioritizedStep,
    error,
    refresh,
  };
};
