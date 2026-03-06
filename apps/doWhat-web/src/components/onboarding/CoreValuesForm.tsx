"use client";

import type { Route } from 'next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CORE_VALUES_REQUIRED_COUNT, loadUserPreference, normalizeCoreValues, saveUserPreference } from '@dowhat/shared';

import { supabase } from '@/lib/supabase/browser';
import { isMissingColumnError } from '@/lib/supabase/errors';

type CoreValuesFormProps = {
  redirectTo: string;
  className?: string;
};

const DEFAULT_VALUES = ['', '', ''];
const CORE_VALUES_PREFERENCE_KEY = 'onboarding_core_values' as const;

const normalizeInputValues = (values: string[]): string[] => {
  const normalized = normalizeCoreValues(values);
  return Array.from({ length: CORE_VALUES_REQUIRED_COUNT }, (_, index) => normalized[index] ?? '');
};

type ErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

const errorMessage = (error: unknown): string => {
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === 'object') {
    const payload = error as ErrorLike;
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
    if (typeof payload.details === 'string' && payload.details.trim()) return payload.details.trim();
    if (typeof payload.hint === 'string' && payload.hint.trim()) return payload.hint.trim();
  }
  return '';
};

const describeSaveError = (error: unknown): string => {
  const message = errorMessage(error);
  const normalized = message.toLowerCase();
  if (!normalized) return 'Unable to save core values.';
  if (normalized.includes('permission denied') || normalized.includes('row-level security')) {
    return 'Permission denied while saving core values. Ensure RLS allows users to update their own profile row.';
  }
  if (normalized.includes('column') && normalized.includes('core_values')) {
    return 'Profiles table is missing `core_values`. Run migration 037_profile_core_values.sql and try again.';
  }
  return message;
};

export function CoreValuesForm({ redirectTo, className }: CoreValuesFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<string[]>(DEFAULT_VALUES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const { data } = await supabase.auth.getUser();
        const user = data.user ?? null;
        if (!user) {
          setError('Please sign in again to continue.');
          return;
        }
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('core_values')
          .eq('id', user.id)
          .maybeSingle<{ core_values?: string[] | null }>();
        if (profileError && profileError.code !== 'PGRST116') {
          if (!isMissingColumnError(profileError, 'core_values')) {
            throw profileError;
          }
          const fallback = await loadUserPreference<string[]>(
            supabase,
            user.id,
            CORE_VALUES_PREFERENCE_KEY,
          );
          if (!active) return;
          setValues(normalizeInputValues(fallback ?? []));
          return;
        }
        if (!active) return;
        setValues(normalizeInputValues(profile?.core_values ?? []));
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load core values right now.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const normalized = useMemo(() => normalizeCoreValues(values), [values]);

  const onValueChange = useCallback((index: number, next: string) => {
    setValues((prev) => prev.map((entry, idx) => (idx === index ? next : entry)));
  }, []);

  const onSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const nextValues = normalizeCoreValues(values);
    if (nextValues.length < CORE_VALUES_REQUIRED_COUNT) {
      setError(`Please enter ${CORE_VALUES_REQUIRED_COUNT} distinct core values.`);
      return;
    }

    try {
      setSaving(true);
      const { data } = await supabase.auth.getUser();
      const user = data.user ?? null;
      if (!user) {
        setError('Please sign in again to continue.');
        return;
      }

      const basePayload = {
        id: user.id,
        user_id: user.id,
        core_values: nextValues,
        updated_at: new Date().toISOString(),
      };
      const { error: initialError } = await supabase
        .from('profiles')
        .upsert(basePayload, { onConflict: 'id' });

      let updateError = initialError;
      if (updateError && isMissingColumnError(updateError, 'user_id')) {
        const fallbackPayload = {
          id: user.id,
          core_values: nextValues,
          updated_at: basePayload.updated_at,
        };
        const retry = await supabase.from('profiles').upsert(fallbackPayload, { onConflict: 'id' });
        updateError = retry.error ?? null;
      }
      if (updateError && isMissingColumnError(updateError, 'core_values')) {
        await saveUserPreference(
          supabase,
          user.id,
          CORE_VALUES_PREFERENCE_KEY,
          nextValues,
        );
        setSuccess('Core values saved. Continuing…');
        router.push(redirectTo as Route);
        return;
      }

      if (updateError) {
        throw updateError;
      }

      setSuccess('Core values saved. Continuing…');
      router.push(redirectTo as Route);
    } catch (submitError) {
      setError(describeSaveError(submitError));
    } finally {
      setSaving(false);
    }
  }, [redirectTo, router, values]);

  if (loading) {
    return (
      <div className={`rounded-3xl border border-white/10 bg-white/5 p-6 ${className ?? ''}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-48 rounded bg-white/20" />
          <div className="h-10 rounded bg-white/10" />
          <div className="h-10 rounded bg-white/10" />
          <div className="h-10 rounded bg-white/10" />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={`rounded-3xl border border-white/10 bg-white/5 p-6 ${className ?? ''}`}>
      <h2 className="text-lg font-semibold text-white">Add your 3 core values</h2>
      <p className="mt-2 text-sm text-slate-200">
        These values shape matches and event suggestions. Example: Punctuality, Curiosity, Respect.
      </p>
      <div className="mt-5 space-y-3">
        {values.map((value, index) => (
          <label key={index} className="block text-sm text-slate-100">
            Core value {index + 1}
            <input
              value={value}
              onChange={(event) => onValueChange(index, event.target.value)}
              maxLength={48}
              required
              className="mt-1 w-full rounded-xl border border-white/20 bg-slate-900/30 px-3 py-2 text-white placeholder:text-slate-400 focus:border-emerald-300 focus:outline-none"
              placeholder={`Value ${index + 1}`}
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-300">
        {normalized.length}/{CORE_VALUES_REQUIRED_COUNT} distinct values
      </p>
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-300">{success}</p> : null}
      <button
        type="submit"
        disabled={saving}
        className="btn-primary mt-5 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {saving ? 'Saving…' : 'Save values and continue'}
      </button>
    </form>
  );
}
