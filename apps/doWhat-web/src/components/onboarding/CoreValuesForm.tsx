"use client";

import type { Route } from 'next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CORE_VALUES_REQUIRED_COUNT, normalizeCoreValues } from '@dowhat/shared';

import { supabase } from '@/lib/supabase/browser';

type CoreValuesFormProps = {
  redirectTo: string;
  className?: string;
};

const DEFAULT_VALUES = ['', '', ''];

const normalizeInputValues = (values: string[]): string[] => {
  const normalized = normalizeCoreValues(values);
  return Array.from({ length: CORE_VALUES_REQUIRED_COUNT }, (_, index) => normalized[index] ?? '');
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
          throw profileError;
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

      const payload = {
        id: user.id,
        user_id: user.id,
        core_values: nextValues,
        updated_at: new Date().toISOString(),
      };
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' });
      if (updateError) {
        throw updateError;
      }

      setSuccess('Core values saved. Continuing…');
      router.push(redirectTo as Route);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save core values.');
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
