import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { theme, trackOnboardingEntry } from '@dowhat/shared';

import { STEP_LABELS, STEP_ROUTES } from '../constants/onboardingSteps';
import { useOnboardingProgress } from '../hooks/useOnboardingProgress';

const { colors, radius, spacing } = theme;

export default function OnboardingNavPill() {
  const { hydrated, loading, pendingSteps, prioritizedStep, refresh } = useOnboardingProgress();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const pendingCount = pendingSteps.length;
  const pillCopy = useMemo(() => {
    if (!pendingCount || !prioritizedStep) return '';
    if (pendingCount === 1) return '1 step left';
    return `${pendingCount} steps left`;
  }, [pendingCount, prioritizedStep]);

  if (!hydrated && loading) return null;
  if (!pendingCount || !prioritizedStep) return null;

  const nextHref = STEP_ROUTES[prioritizedStep];
  const prioritizedLabel = STEP_LABELS[prioritizedStep];

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Link
        href={nextHref}
        asChild
        onPress={() =>
          trackOnboardingEntry({
            source: 'onboarding-nav-pill-mobile',
            platform: 'mobile',
            step: prioritizedStep,
            steps: pendingSteps,
            pendingSteps: pendingCount,
            nextStep: nextHref,
          })
        }
      >
        <Pressable style={styles.pill} testID="onboarding-nav-pill-cta" accessibilityRole="button">
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pillCopy}</Text>
          </View>
          <View style={styles.copyStack}>
            <Text style={styles.title}>Finish onboarding</Text>
            <Text style={styles.subtitle}>Next: {prioritizedLabel}</Text>
          </View>
          <Text style={styles.chevron}>↗</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderColor: 'rgba(5, 150, 105, 0.3)',
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  badge: {
    backgroundColor: '#D1FAE5',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#047857',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  copyStack: {
    flex: 1,
  },
  title: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 14,
  },
  subtitle: {
    color: '#047857',
    fontSize: 13,
    marginTop: 2,
  },
  chevron: {
    color: '#065F46',
    fontSize: 18,
    fontWeight: '700',
  },
});
