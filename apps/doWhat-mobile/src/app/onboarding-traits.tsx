import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { User } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { ensureUserRow } from '../lib/ensureUserRow';

const MAX_TRAITS = 5;

type TraitOption = {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
};

const DEFAULT_COLOR = '#0EA5E9';
const TRAIT_ICON_FALLBACK = '✨';
const TRAIT_ICON_EMOJI_MAP: Record<string, string> = {
  Heart: '❤️',
  Sparkles: '✨',
  Smile: '😊',
  Zap: '⚡️',
  Star: '⭐️',
  Sun: '☀️',
  Moon: '🌙',
  Flame: '🔥',
  Users: '🤝',
  Shield: '🛡️',
  Lotus: '🌸',
  Megaphone: '📣',
  Compass: '🧭',
  Target: '🎯',
  Gamepad2: '🎮',
  ClipboardCheck: '✅',
  SmilePlus: '😄',
  Shuffle: '🔀',
  ShieldCheck: '🛡️',
};

const traitTintFromColor = (value?: string | null, alpha = 0.16) => {
  if (typeof value !== 'string' || !value.trim()) {
    return `rgba(14, 165, 233, ${alpha})`;
  }
  const trimmed = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
  if (!/^#([0-9a-f]{6})$/i.test(trimmed)) {
    return `rgba(14, 165, 233, ${alpha})`;
  }
  const hex = trimmed.slice(1);
  const numeric = Number.parseInt(hex, 16);
  const r = (numeric >> 16) & 255;
  const g = (numeric >> 8) & 255;
  const b = numeric & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const resolveTraitGlyph = (icon?: string | null): string => {
  if (!icon) return TRAIT_ICON_FALLBACK;
  if (TRAIT_ICON_EMOJI_MAP[icon]) return TRAIT_ICON_EMOJI_MAP[icon];
  const trimmed = icon.trim();
  if (!trimmed) return TRAIT_ICON_FALLBACK;
  if (trimmed.length === 1) return trimmed.toUpperCase();
  return trimmed.charAt(0).toUpperCase();
};

const describeError = (error: unknown, fallback = 'Something went wrong. Please try again.') => {
  if (!error) return fallback;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
};

const pickMetadataString = (metadata: Record<string, unknown> | undefined, keys: string[]): string | null => {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
};

const resolveUserFullName = (user: User | null): string | null => {
  if (!user) return null;
  return (
    pickMetadataString(user.user_metadata, ['full_name', 'name', 'given_name']) ||
    (typeof user.user_metadata?.preferred_username === 'string'
      ? user.user_metadata.preferred_username.trim() || null
      : null)
  );
};

const resolveUserEmail = (user: User | null): string | null => {
  if (!user) return null;
  if (typeof user.email === 'string' && user.email.trim()) {
    return user.email.trim();
  }
  return pickMetadataString(user.user_metadata, ['contact_email', 'email']);
};

const isForeignKeyMissingUser = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof record.code === 'string' ? record.code : null;
  const message = typeof record.message === 'string' ? record.message : '';
  const details = typeof record.details === 'string' ? record.details : '';
  if (code && code !== '23503') return false;
  return /user[s]?[_-]?[a-z]*_?id?_?fkey/i.test(message) || /user[s]?[_-]?[a-z]*_?id?_?fkey/i.test(details) || /table "users"/i.test(details);
};

async function persistTraitSelection(userId: string, traitIds: string[]) {
  const unique = Array.from(new Set(traitIds.filter((id) => typeof id === 'string' && id.trim().length > 0)));
  if (unique.length !== MAX_TRAITS) {
    throw new Error(`Pick exactly ${MAX_TRAITS} traits.`);
  }

  const { data: existing, error: catalogError } = await supabase
    .from('traits')
    .select('id')
    .in('id', unique);
  if (catalogError) throw catalogError;
  const available = new Set((existing ?? []).map((row) => row.id));
  if (available.size !== unique.length) {
    throw new Error('One of the selected traits is no longer available. Refresh and try again.');
  }

  const { error: deleteError } = await supabase.from('user_base_traits').delete().eq('user_id', userId);
  if (deleteError) throw deleteError;

  const payload = unique.map((traitId) => ({ user_id: userId, trait_id: traitId }));
  const { error: insertError } = await supabase.from('user_base_traits').insert(payload);
  if (insertError) throw insertError;

  await Promise.all(
    unique.map(async (traitId) => {
      const { error: rpcError } = await supabase.rpc('increment_user_trait_score', {
        p_user: userId,
        p_trait: traitId,
        p_score_delta: 3,
        p_base_delta: 1,
        p_vote_delta: 0,
      });
      if (rpcError) throw rpcError;
    }),
  );
}

const TraitSelectionScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [catalog, setCatalog] = useState<TraitOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [prefillDone, setPrefillDone] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadCatalog = useCallback(async () => {
    setCatalogError(null);
    setCatalogLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('traits')
        .select('id, name, color, icon')
        .order('name', { ascending: true });
      if (fetchError) throw fetchError;
      setCatalog(data ?? []);
    } catch (err) {
      console.error('[traits] catalog fetch failed', err);
      setCatalogError('Could not load traits. Tap reload or try again.');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const hydrateSelection = useCallback(async () => {
    setPrefillDone(false);
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!userId) {
        setSelection([]);
        return;
      }
      const { data: rows, error: loadError } = await supabase
        .from('user_base_traits')
        .select('trait_id')
        .eq('user_id', userId);
      if (loadError) throw loadError;
      const existing = (rows ?? [])
        .map((row) => row.trait_id)
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .slice(0, MAX_TRAITS);
      setSelection(existing);
    } catch (err) {
      if (__DEV__) console.warn('[traits] prefill failed', err);
    } finally {
      setPrefillDone(true);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
    hydrateSelection();
  }, [loadCatalog, hydrateSelection]);

  const filteredTraits = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return catalog;
    return catalog.filter((trait) => trait.name.toLowerCase().includes(term));
  }, [catalog, query]);

  const remaining = MAX_TRAITS - selection.length;
  const ready = selection.length === MAX_TRAITS;
  const disableNewAdds = remaining === 0;
  const busy = catalogLoading || !prefillDone;

  const toggleTrait = useCallback(
    (traitId: string) => {
      setError(null);
      setSelection((prev) => {
        if (prev.includes(traitId)) {
          return prev.filter((id) => id !== traitId);
        }
        if (prev.length >= MAX_TRAITS) {
          return prev;
        }
        return [...prev, traitId];
      });
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user ?? null;
      if (!user) {
        setError('Please sign in again.');
        return;
      }

      const saveAndNavigate = async () => {
        await persistTraitSelection(user.id, selection);
        router.replace('/(tabs)');
      };

      const ensurePayload = {
        id: user.id,
        email: resolveUserEmail(user) ?? undefined,
        fullName: resolveUserFullName(user),
      } as const;

      await ensureUserRow(ensurePayload);

      try {
        await saveAndNavigate();
        return;
      } catch (primaryError) {
        if (isForeignKeyMissingUser(primaryError)) {
          const ensured = await ensureUserRow(ensurePayload);
          if (ensured) {
            await saveAndNavigate();
            return;
          }
          setError('Your account needs to finish syncing. Sign out and back in, then try again.');
          if (__DEV__) console.warn('[traits] user_base_traits failed due to missing users row', primaryError);
          return;
        }
        throw primaryError;
      }
    } catch (err) {
      console.error('[traits] save failed', err);
      setError(describeError(err, 'Could not save your traits. Please try again.'));
    } finally {
      setSaving(false);
    }
  }, [ready, saving, selection]);

  const counter = `${selection.length} / ${MAX_TRAITS} selected`;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + 16}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 160 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Choose 5 traits that describe you</Text>
          <Text style={styles.counter}>{counter}</Text>
        </View>
        <Text style={styles.subheading}>Pick your starting vibe. Teammates can nominate more traits after sessions.</Text>

        <View style={styles.inputWrapper}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search traits"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            textContentType="none"
            editable={!catalogLoading}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {catalogError ? <Text style={styles.warning}>{catalogError}</Text> : null}

        <View style={styles.selectedRow}>
          {selection.length ? (
            selection.map((id) => {
              const trait = catalog.find((entry) => entry.id === id);
              if (!trait) return null;
              return (
                <View key={id} style={[styles.selectedChip, { backgroundColor: traitTintFromColor(trait.color, 0.24) }]}
                >
                  <Text style={styles.selectedChipText}>{trait.name}</Text>
                  <Pressable hitSlop={8} onPress={() => toggleTrait(id)}>
                    <Text style={styles.selectedChipRemove}>×</Text>
                  </Pressable>
                </View>
              );
            })
          ) : (
            <Text style={styles.selectedPlaceholder}>Selections appear here.</Text>
          )}
        </View>

        <View style={styles.catalogHeader}>
          <Text style={styles.catalogTitle}>{filteredTraits.length} traits</Text>
          <Pressable style={styles.retryButton} onPress={loadCatalog} disabled={catalogLoading}>
            <Text style={styles.retryText}>{catalogLoading ? 'Refreshing…' : 'Reload'}</Text>
          </Pressable>
        </View>

        {busy ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color="#38BDF8" />
            <Text style={styles.loadingText}>Loading catalog…</Text>
          </View>
        ) : (
          <View style={styles.catalogGrid}>
            {filteredTraits.map((trait) => (
              <TraitCard
                key={trait.id}
                trait={trait}
                selected={selection.includes(trait.id)}
                disabled={!selection.includes(trait.id) && disableNewAdds}
                onToggle={() => toggleTrait(trait.id)}
              />
            ))}
            {!filteredTraits.length && !catalogLoading && (
              <Text style={styles.emptyState}>No traits match that search.</Text>
            )}
          </View>
        )}

        <Text style={styles.helperText}>
          {remaining > 0 ? `Select ${remaining} more ${remaining === 1 ? 'trait' : 'traits'} to continue.` : 'All set! Save to continue.'}
        </Text>

        <Pressable
          testID="trait-onboarding-save-button"
          accessibilityRole="button"
          style={[styles.continueButton, ready ? styles.continueEnabled : styles.continueDisabled]}
          disabled={!ready || saving}
          onPress={handleSave}
        >
          <Text style={styles.continueText}>{saving ? 'Saving…' : 'Save traits'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heading: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  counter: {
    fontSize: 14,
    fontWeight: '600',
    color: '#38BDF8',
  },
  subheading: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 22,
    color: '#94A3B8',
  },
  inputWrapper: {
    marginTop: 28,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  input: {
    fontSize: 16,
    color: '#E2E8F0',
    paddingVertical: 12,
  },
  selectedRow: {
    marginTop: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    gap: 6,
  },
  selectedChipText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  selectedChipRemove: {
    color: '#0F172A',
    fontWeight: '700',
  },
  selectedPlaceholder: {
    color: '#475569',
    fontSize: 13,
  },
  catalogHeader: {
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catalogTitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  retryButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  retryText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingState: {
    marginTop: 32,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  catalogGrid: {
    marginTop: 20,
    gap: 12,
  },
  traitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0F172A',
    gap: 14,
  },
  traitCardSelected: {
    backgroundColor: '#0B1120',
    borderColor: '#34D399',
  },
  traitCardDisabled: {
    opacity: 0.45,
  },
  traitEmoji: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  traitEmojiText: {
    fontSize: 20,
  },
  traitInfo: {
    flex: 1,
  },
  traitName: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '600',
  },
  traitHint: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  traitCheck: {
    color: '#34D399',
    fontSize: 20,
    fontWeight: '700',
  },
  warning: {
    marginTop: 12,
    color: '#FBBF24',
    fontSize: 13,
  },
  error: {
    marginTop: 12,
    color: '#F87171',
    fontSize: 13,
  },
  emptyState: {
    marginTop: 24,
    color: '#475569',
    textAlign: 'center',
    fontSize: 14,
  },
  helperText: {
    marginTop: 24,
    color: '#94A3B8',
    textAlign: 'center',
    fontSize: 13,
  },
  continueButton: {
    marginTop: 24,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueEnabled: {
    backgroundColor: '#34D399',
  },
  continueDisabled: {
    backgroundColor: '#1F2937',
  },
  continueText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
});

type TraitCardProps = {
  trait: TraitOption;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
};

const TraitCard: React.FC<TraitCardProps> = ({ trait, selected, disabled, onToggle }) => {
  const accent = trait.color?.trim() || DEFAULT_COLOR;
  return (
    <Pressable
      testID={`trait-card-${trait.id}`}
      onPress={onToggle}
      disabled={disabled}
      style={[styles.traitCard, selected && styles.traitCardSelected, disabled && !selected && styles.traitCardDisabled]}
    >
      <View style={[styles.traitEmoji, { backgroundColor: traitTintFromColor(accent, selected ? 0.32 : 0.2) }]}
      >
        <Text style={styles.traitEmojiText}>{resolveTraitGlyph(trait.icon)}</Text>
      </View>
      <View style={styles.traitInfo}>
        <Text style={styles.traitName}>{trait.name}</Text>
        <Text style={styles.traitHint}>{selected ? 'Tap to remove' : 'Tap to add'}</Text>
      </View>
      {selected ? <Text style={styles.traitCheck}>✓</Text> : null}
    </Pressable>
  );
};

export default TraitSelectionScreen;
