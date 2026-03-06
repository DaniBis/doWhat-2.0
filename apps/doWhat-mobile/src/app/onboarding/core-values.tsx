import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CORE_VALUES_REQUIRED_COUNT, loadUserPreference, normalizeCoreValues, saveUserPreference, theme } from '@dowhat/shared';

import { supabase } from '../../lib/supabase';
import { isMissingColumnError } from '../../lib/supabaseErrors';

const EMPTY_VALUES = ['', '', ''];
const CORE_VALUES_PREFERENCE_KEY = 'onboarding_core_values' as const;

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

export default function OnboardingCoreValuesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [values, setValues] = useState<string[]>(EMPTY_VALUES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user ?? null;
        if (!user) {
          if (active) setError('Please sign in again.');
          return;
        }
        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('core_values')
          .eq('id', user.id)
          .maybeSingle<{ core_values?: string[] | null }>();
        let normalized = normalizeCoreValues(data?.core_values ?? []);
        if (profileError && profileError.code !== 'PGRST116') {
          if (!isMissingColumnError(profileError, 'core_values')) {
            throw profileError;
          }
          try {
            const fallback = await loadUserPreference<string[]>(
              supabase,
              user.id,
              CORE_VALUES_PREFERENCE_KEY,
            );
            normalized = normalizeCoreValues(fallback ?? []);
          } catch (fallbackError) {
            throw fallbackError;
          }
        }
        if (!active) return;
        setValues(Array.from({ length: CORE_VALUES_REQUIRED_COUNT }, (_, index) => normalized[index] ?? ''));
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load core values.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const normalized = useMemo(() => normalizeCoreValues(values), [values]);

  const setValue = (index: number, nextValue: string) => {
    setValues((prev) => prev.map((entry, idx) => (idx === index ? nextValue : entry)));
  };

  const submit = async () => {
    setError(null);
    const nextValues = normalizeCoreValues(values);
    if (nextValues.length < CORE_VALUES_REQUIRED_COUNT) {
      setError(`Please add ${CORE_VALUES_REQUIRED_COUNT} distinct core values.`);
      return;
    }
    try {
      setSaving(true);
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user ?? null;
      if (!user) {
        setError('Please sign in again.');
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
        router.push('/onboarding/reliability-pledge');
        return;
      }

      if (updateError) {
        throw updateError;
      }
      router.push('/onboarding/reliability-pledge');
    } catch (submitError) {
      setError(describeSaveError(submitError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top || 24, paddingBottom: insets.bottom || 24 }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>Step 2</Text>
        <Text style={styles.title}>Add your 3 core values</Text>
        <Text style={styles.subtitle}>
          Core values help us rank better teammates and more reliable sessions.
        </Text>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={theme.colors.brandTeal} />
            <Text style={styles.loadingText}>Loading core values…</Text>
          </View>
        ) : (
          <View style={styles.formCard}>
            {values.map((value, index) => (
              <View key={index} style={styles.fieldWrap}>
                <Text style={styles.label}>Core value {index + 1}</Text>
                <TextInput
                  value={value}
                  onChangeText={(nextValue) => setValue(index, nextValue)}
                  placeholder={`Value ${index + 1}`}
                  maxLength={48}
                  style={styles.input}
                  placeholderTextColor="#94a3b8"
                />
              </View>
            ))}
            <Text style={styles.counter}>{normalized.length}/{CORE_VALUES_REQUIRED_COUNT} distinct values</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable onPress={submit} disabled={saving} style={[styles.submitButton, saving && styles.submitButtonDisabled]}>
              <Text style={styles.submitButtonText}>{saving ? 'Saving…' : 'Save values and continue'}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 10,
  },
  eyebrow: {
    color: '#6ee7b7',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 22,
  },
  loadingWrap: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#cbd5e1',
    fontSize: 14,
  },
  formCard: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: 'rgba(15,23,42,0.65)',
    padding: 16,
    gap: 12,
  },
  fieldWrap: {
    gap: 6,
  },
  label: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.45)',
    backgroundColor: 'rgba(15,23,42,0.8)',
    color: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  counter: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  error: {
    color: '#fca5a5',
    fontSize: 13,
  },
  submitButton: {
    borderRadius: 999,
    backgroundColor: '#059669',
    paddingVertical: 11,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.65,
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
