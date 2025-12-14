import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { theme, trackOnboardingEntry } from '@dowhat/shared';

import { STEP_LABELS, STEP_ROUTES } from '../constants/onboardingSteps';
import { useOnboardingProgress } from '../hooks/useOnboardingProgress';

const { colors, spacing, radius, border } = theme;

export default function OnboardingNavPrompt() {
  const { hydrated, loading, pendingSteps, prioritizedStep, error, refresh } = useOnboardingProgress();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const pendingCount = pendingSteps.length;
  const encouragementCopy = useMemo(() => {
    if (pendingCount === 0) return '';
    if (pendingCount === 1) return 'Just one more action to unlock full Social Sweat access.';
    const label = pendingCount === 1 ? '1 step' : `${pendingCount} steps`;
    return `${label} remain — finish them so hosts prioritize you for open slots.`;
  }, [pendingCount]);

  if (!hydrated && loading) {
    return (
      <View style={styles.loadingCard}>
        <ActivityIndicator color={colors.emeraldInk} size="small" />
        <Text style={styles.loadingText}>Checking onboarding progress…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorCard}>
        <Text style={styles.errorTitle}>Finish onboarding</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <Pressable style={styles.retryCta} onPress={() => void refresh()}>
          <Text style={styles.retryCtaText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (pendingCount === 0 || !prioritizedStep) {
    return null;
  }

  const prioritizedLabel = STEP_LABELS[prioritizedStep];
  const nextHref = STEP_ROUTES[prioritizedStep];

  return (
    <View style={styles.card} testID="onboarding-nav-card">
      <View style={styles.tag}>
        <Text style={styles.tagText}>Step 0 progress</Text>
      </View>
      <Text style={styles.heading}>Finish onboarding</Text>
      <Text style={styles.copy}>{encouragementCopy}</Text>
      <Text style={styles.nextUp}>Next up: {prioritizedLabel}</Text>
      <View style={styles.chipsRow}>
        {pendingSteps.map((step) => (
          <View key={step} style={styles.chip}>
            <Text style={styles.chipText}>{STEP_LABELS[step]}</Text>
          </View>
        ))}
      </View>
      <Link
        href={nextHref}
        asChild
        onPress={() =>
          trackOnboardingEntry({
            source: 'onboarding-nav-mobile',
            platform: 'mobile',
            step: prioritizedStep,
            steps: pendingSteps,
            pendingSteps: pendingCount,
            nextStep: nextHref,
          })
        }
      >
        <Pressable accessibilityRole="button" style={styles.cta} testID="onboarding-nav-cta">
          <Text style={styles.ctaText}>Go to next step</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    borderColor: 'rgba(16,185,129,0.4)',
    backgroundColor: '#ECFDF5',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  tag: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    borderColor: '#A7F3D0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  tagText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#064E3B',
  },
  copy: {
    fontSize: 14,
    color: '#065F46',
    lineHeight: 20,
  },
  nextUp: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065F46',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    borderColor: '#A7F3D0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#064E3B',
  },
  cta: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    backgroundColor: colors.emeraldInk,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
    shadowColor: colors.emeraldInk,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  ctaText: {
    color: colors.surface,
    fontWeight: '700',
  },
  loadingCard: {
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: '#FFFFFF',
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: '#065F46',
    fontSize: 13,
  },
  errorCard: {
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#7F1D1D',
  },
  errorMessage: {
    color: '#991B1B',
    fontSize: 14,
  },
  retryCta: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    borderColor: '#991B1B',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryCtaText: {
    color: '#7F1D1D',
    fontWeight: '700',
  },
});
