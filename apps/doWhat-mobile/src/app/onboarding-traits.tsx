import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Animated,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { supabase } from '../lib/supabase';

const MAX_TRAITS = 5;
const MIN_LENGTH = 2;
const MAX_LENGTH = 20;

const BANNED_WORDS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'slut',
  'whore',
  'nazi',
  'terrorist',
  'racist',
  'sexist',
  'homophobic',
];

const TRAIT_COLORS = ['#FF9F43', '#FF6B6B', '#6C5CE7', '#10B981', '#2D9CDB', '#F2C94C'];

type CanonicalTrait = {
  key: string;
  display: string;
};

const hashKey = (key: string) => {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

export const normalizeTrait = (input: string): CanonicalTrait => {
  const trimmed = input.trim();
  const collapsed = trimmed.replace(/\s+/g, ' ');
  const lower = collapsed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const display = collapsed
    .toLowerCase()
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return { key: lower, display };
};

export const isProfane = (input: string) => {
  const candidate = input.trim().toLowerCase();
  return BANNED_WORDS.some((word) => candidate.includes(word));
};

export const validateTrait = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (trimmed.length < MIN_LENGTH || trimmed.length > MAX_LENGTH) return false;
  if (isProfane(trimmed)) return false;
  return true;
};

export async function saveTraitsToSupabase(userId: string, traits: CanonicalTrait[]) {
  if (!traits.length) return;
  const canonicalTraits = traits.map((trait) => trait.display.trim()).filter(Boolean);

  const { data, error } = await supabase
    .from('profiles')
    .update({
      personality_traits: canonicalTraits,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id');

  if (error) {
    throw error;
  }

  if (!data?.length) {
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          personality_traits: canonicalTraits,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
    if (upsertError) throw upsertError;
  }
}

type TraitChipProps = {
  trait: CanonicalTrait;
  onRemove: () => void;
};

const TraitChip: React.FC<TraitChipProps> = ({ trait, onRemove }) => {
  const colorIndex = hashKey(trait.key) % TRAIT_COLORS.length;
  const bgColor = TRAIT_COLORS[colorIndex];
  const scale = useRef(new Animated.Value(0.85)).current;

  React.useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      damping: 12,
    }).start();
  }, [scale]);

  return (
    <Animated.View style={[styles.chip, { backgroundColor: `${bgColor}1A`, borderColor: bgColor, transform: [{ scale }] }]}
    >
      <Text style={[styles.chipText, { color: bgColor }]}>{trait.display}</Text>
      <Pressable hitSlop={12} onPress={onRemove}>
        <Text style={[styles.chipRemove, { color: bgColor }]}>×</Text>
      </Pressable>
    </Animated.View>
  );
};

const TraitSelectionScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [inputValue, setInputValue] = useState('');
  const [traits, setTraits] = useState<CanonicalTrait[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleAddTrait = useCallback(
    (rawValue: string) => {
      const trimmed = rawValue.replace(/[\n,]/g, '').trim();
      if (!trimmed) return;
      if (!validateTrait(trimmed)) {
        setError('Traits must be 2-20 letters, no profanity.');
        return;
      }
      const next = normalizeTrait(trimmed);
      if (!next.key) {
        setError('Trait looks empty. Try again.');
        return;
      }
      if (traits.some((trait) => trait.key === next.key)) {
        setError('Trait already added.');
        return;
      }
      if (traits.length >= MAX_TRAITS) {
        setWarning('You already have 5 traits. Remove one to add another.');
        return;
      }
      setTraits((prev) => [...prev, next]);
      setInputValue('');
      setWarning(null);
      setError(null);
    },
    [traits]
  );

  const handleTextChange = (text: string) => {
    if (text.includes(',') || text.includes('\n')) {
      const parts = text.replace(/\n/g, ',').split(',');
      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          setInputValue(part);
        } else {
          handleAddTrait(part);
        }
      });
      return;
    }
    setInputValue(text);
  };

  const handleSubmitEditing = () => {
    handleAddTrait(inputValue);
  };

  const handleRemoveTrait = useCallback((key: string) => {
    setTraits((prev) => prev.filter((trait) => trait.key !== key));
    setWarning(null);
    setError(null);
  }, []);

  const handleContinue = useCallback(async () => {
    if (traits.length !== MAX_TRAITS) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!userId) {
        setError('Please sign in again.');
        setSaving(false);
        return;
      }
      await saveTraitsToSupabase(userId, traits);
      router.push('/(tabs)');
    } catch (err) {
      console.error('[traits] save failed', err);
      setError('Could not save your traits. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [traits]);

  const counter = `${traits.length} / ${MAX_TRAITS} traits added`;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + 16}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 160 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator
      >
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Choose 5 traits that describe you</Text>
          <Text style={styles.counter}>{counter}</Text>
        </View>
        <Text style={styles.subheading}>
          Type a trait and press Enter. Other people can add more after activities.
        </Text>

        <View style={styles.inputWrapper}>
          <TextInput
            value={inputValue}
            onChangeText={handleTextChange}
            onSubmitEditing={handleSubmitEditing}
            placeholder="Type a trait and press Enter… (e.g. friendly, creative)"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            textContentType="none"
            returnKeyType="done"
            blurOnSubmit={false}
            editable={!saving && traits.length < MAX_TRAITS}
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {warning ? <Text style={styles.warning}>{warning}</Text> : null}

        <View style={styles.chipGrid}>
          {traits.length ? (
            traits.map((trait) => (
              <TraitChip key={trait.key} trait={trait} onRemove={() => handleRemoveTrait(trait.key)} />
            ))
          ) : (
            <Text style={styles.emptyState}>No traits yet. Start typing above.</Text>
          )}
        </View>

        <Pressable
          style={[styles.continueButton, traits.length === MAX_TRAITS ? styles.continueEnabled : styles.continueDisabled]}
          disabled={traits.length !== MAX_TRAITS || saving}
          onPress={handleContinue}
        >
          <Text style={styles.continueText}>{saving ? 'Saving…' : 'Continue'}</Text>
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
  chipGrid: {
    paddingVertical: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    gap: 8,
    marginRight: 12,
    marginBottom: 12,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chipRemove: {
    fontSize: 16,
    fontWeight: '700',
  },
  warning: {
    marginTop: 8,
    color: '#FBBF24',
    fontSize: 13,
  },
  error: {
    marginTop: 8,
    color: '#F87171',
    fontSize: 13,
  },
  emptyState: {
    marginTop: 24,
    color: '#475569',
    textAlign: 'center',
    fontSize: 14,
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

export default TraitSelectionScreen;
