import { Link } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  derivePendingOnboardingSteps,
  getSportLabel,
  hasCompletedSportStep,
  isPlayStyle,
  isSportType,
  ONBOARDING_TRAIT_GOAL,
  theme,
  trackOnboardingEntry,
  type OnboardingStep,
  type PlayStyle,
  type SportType,
} from "@dowhat/shared";

import { supabase } from "../../lib/supabase";

type StepDefinition = {
  id: OnboardingStep;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
};

type HydratedStep = StepDefinition & {
  complete: boolean;
  statusNote: string;
};

const STEP_DEFINITIONS: ReadonlyArray<StepDefinition> = [
  {
    id: "traits",
    title: "Step 1 · Vibes",
    description: "Pick five base traits so your vibe shows up everywhere members see you.",
    actionLabel: "Go to trait onboarding",
    href: "/onboarding-traits",
  },
  {
    id: "sport",
    title: "Step 2 · Sport & skill",
    description: "Tell us your primary sport, play style, and skill so we can fill the right open spots.",
    actionLabel: "Set sport preferences",
    href: "/onboarding/sports",
  },
  {
    id: "pledge",
    title: "Step 3 · Reliability pledge",
    description: "Confirm the four doWhat commitments so hosts know they can count on you.",
    actionLabel: "Review pledge",
    href: "/onboarding/reliability-pledge",
  },
];

const STEP_LABELS: Record<OnboardingStep, string> = {
  traits: "Pick 5 base traits",
  sport: "Set your sport & skill",
  pledge: "Confirm the reliability pledge",
};

const formatAckDate = (value: string | null) => {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
  } catch {
    return new Date(value).toDateString();
  }
};

const describeError = (error: unknown, fallback = "Could not load onboarding progress. Try again shortly.") => {
  if (!error) return fallback;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
};

const { colors, spacing, radius, border, shadow } = theme;
const TRAIT_GOAL = ONBOARDING_TRAIT_GOAL;

const OnboardingHomeScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traitCount, setTraitCount] = useState<number>(0);
  const [primarySport, setPrimarySport] = useState<SportType | null>(null);
  const [playStyle, setPlayStyle] = useState<PlayStyle | null>(null);
  const [sportSkillLevel, setSportSkillLevel] = useState<string | null>(null);
  const [pledgeAckAt, setPledgeAckAt] = useState<string | null>(null);

  const fetchProgress = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        setError("Please sign in again to finish onboarding.");
        setTraitCount(0);
        setPrimarySport(null);
        setPlayStyle(null);
        setSportSkillLevel(null);
        setPledgeAckAt(null);
        return;
      }

      const [traitsResult, profileResult] = await Promise.all([
        supabase.from("user_base_traits").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase
          .from("profiles")
          .select("primary_sport, play_style, reliability_pledge_ack_at")
          .eq("id", user.id)
          .maybeSingle<{ primary_sport: string | null; play_style: string | null; reliability_pledge_ack_at: string | null }>(),
      ]);

      if (traitsResult.error && traitsResult.error.code !== "PGRST116") {
        throw traitsResult.error;
      }
      const baseTraits = typeof traitsResult.count === "number" ? traitsResult.count : 0;
      setTraitCount(baseTraits);

      if (profileResult.error && profileResult.error.code !== "PGRST116") {
        throw profileResult.error;
      }
      const normalizedSport = profileResult.data?.primary_sport && isSportType(profileResult.data.primary_sport)
        ? (profileResult.data.primary_sport as SportType)
        : null;
      setPrimarySport(normalizedSport);
      const normalizedPlayStyle = profileResult.data?.play_style && isPlayStyle(profileResult.data.play_style)
        ? (profileResult.data.play_style as PlayStyle)
        : null;
      setPlayStyle(normalizedPlayStyle);
      setPledgeAckAt(profileResult.data?.reliability_pledge_ack_at ?? null);

      if (normalizedSport) {
        const { data: sportProfile, error: sportProfileError } = await supabase
          .from("user_sport_profiles")
          .select("skill_level")
          .eq("user_id", user.id)
          .eq("sport", normalizedSport)
          .maybeSingle<{ skill_level: string | null }>();
        if (sportProfileError && sportProfileError.code !== "PGRST116") {
          throw sportProfileError;
        }
        setSportSkillLevel(sportProfile?.skill_level ?? null);
      } else {
        setSportSkillLevel(null);
      }
    } catch (err) {
      console.error("[onboarding-index] progress fetch failed", err);
      setError(describeError(err));
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProgress();
  }, [fetchProgress]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProgress({ silent: true });
    setRefreshing(false);
  }, [fetchProgress]);

  const sportComplete = hasCompletedSportStep({
    primarySport,
    playStyle,
    skillLevel: sportSkillLevel,
  });

  const steps: HydratedStep[] = useMemo(() => {
    const savedTraits = Math.min(traitCount, TRAIT_GOAL);
    return STEP_DEFINITIONS.map((step) => {
      switch (step.id) {
        case "traits":
          return {
            ...step,
            complete: savedTraits >= TRAIT_GOAL,
            statusNote: savedTraits >= TRAIT_GOAL ? `Completed (${savedTraits}/${TRAIT_GOAL} vibes)` : `${savedTraits}/${TRAIT_GOAL} vibes saved`,
          };
        case "sport": {
          const sportLabel = primarySport ? getSportLabel(primarySport) : null;
          return {
            ...step,
            complete: sportComplete,
            statusNote: sportComplete && sportLabel
              ? `Primary sport: ${sportLabel}`
              : "Sport or skill missing",
          };
        }
        case "pledge": {
          const formattedAck = formatAckDate(pledgeAckAt);
          return {
            ...step,
            complete: Boolean(pledgeAckAt),
            statusNote: pledgeAckAt && formattedAck ? `Acknowledged ${formattedAck}` : "Pledge pending",
          };
        }
        default:
          return {
            ...step,
            complete: false,
            statusNote: "Pending",
          };
      }
    });
  }, [playStyle, pledgeAckAt, primarySport, sportComplete, traitCount]);

  const pendingStepIds = useMemo(
    () =>
      derivePendingOnboardingSteps({
        traitCount,
        primarySport,
        playStyle,
        skillLevel: sportSkillLevel,
        pledgeAckAt,
      }),
    [traitCount, primarySport, playStyle, sportSkillLevel, pledgeAckAt],
  );
  const pendingStepCount = pendingStepIds.length;
  const prioritizedStepId = pendingStepIds[0] ?? null;
  const prioritizedLabel = prioritizedStepId ? STEP_LABELS[prioritizedStepId] : null;
  const prioritizedHref = prioritizedStepId
    ? steps.find((step) => step.id === prioritizedStepId)?.href ?? "/onboarding-traits"
    : "/(tabs)/home";
  const encouragementCopy = pendingStepCount === 0
    ? "You’re fully onboarded. Keep details fresh so hosts keep prioritizing you."
    : pendingStepCount === 1
      ? "Just one more action to unlock full doWhat access."
      : `${pendingStepCount} steps remain — finish them so hosts prioritize you for open slots.`;
  const summaryCtaLabel = pendingStepCount === 0 ? "Return to Home" : "Go to next step";

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top || 24, paddingBottom: insets.bottom || 24 }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: (insets.bottom || 24) + spacing.lg }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.success} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryTag}>
            <Text style={styles.summaryTagText}>Step 0 progress</Text>
          </View>
          <Text style={styles.summaryHeading}>Finish the Step 0 checklist</Text>
          <Text style={styles.summaryCopy}>{encouragementCopy}</Text>
          {prioritizedLabel ? <Text style={styles.summaryNext}>Next up: {prioritizedLabel}</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Link
            href={prioritizedHref}
            asChild
            onPress={() => {
              if (!prioritizedStepId) return;
              trackOnboardingEntry({
                source: "onboarding-summary-mobile",
                platform: "mobile",
                step: prioritizedStepId,
                steps: pendingStepIds,
                pendingSteps: pendingStepCount,
                nextStep: prioritizedHref,
              });
            }}
          >
            <Pressable style={styles.summaryCta} accessibilityRole="button">
              <Text style={styles.summaryCtaText}>{summaryCtaLabel}</Text>
            </Pressable>
          </Link>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.success} />
            <Text style={styles.loadingText}>Loading your progress…</Text>
          </View>
        ) : (
          <View style={styles.stepList}>
            {steps.map((step) => (
              <View key={step.id} style={[styles.stepCard, step.complete && styles.stepCardComplete]}>
                <View style={styles.stepHeaderRow}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <View style={[styles.statusPill, step.complete ? styles.statusPillComplete : styles.statusPillPending]}>
                    <Text style={styles.statusPillText}>{step.complete ? "Complete" : "Pending"}</Text>
                  </View>
                </View>
                <Text style={styles.stepDescription}>{step.description}</Text>
                <Text style={[styles.stepStatusNote, step.complete ? styles.stepStatusComplete : styles.stepStatusPending]}>{step.statusNote}</Text>
                <Link
                  href={step.href}
                  asChild
                  onPress={() =>
                    trackOnboardingEntry({
                      source: "onboarding-card-mobile",
                      platform: "mobile",
                      step: step.id,
                      steps: pendingStepCount > 0 ? pendingStepIds : [step.id],
                      pendingSteps: pendingStepCount,
                      nextStep: step.href,
                    })
                  }
                >
                  <Pressable style={[styles.stepAction, step.complete && styles.stepActionSecondary]} accessibilityRole="button">
                    <Text style={[styles.stepActionText, step.complete && styles.stepActionTextSecondary]}>
                      {step.complete ? "Review step" : step.actionLabel}
                    </Text>
                  </Pressable>
                </Link>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.night,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  summaryCard: {
    borderRadius: radius.xl,
    borderWidth: border.hairline,
    borderColor: colors.success,
    backgroundColor: colors.emeraldSurface,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  summaryTag: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    borderColor: "rgba(16, 185, 129, 0.4)",
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  summaryTagText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.emeraldInk,
    letterSpacing: 0.4,
  },
  summaryHeading: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.emeraldInk,
  },
  summaryCopy: {
    fontSize: 14,
    color: colors.emeraldInk,
    lineHeight: 20,
  },
  summaryNext: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.emeraldInk,
  },
  summaryCta: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    backgroundColor: colors.emeraldInk,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  summaryCtaText: {
    color: colors.surface,
    fontWeight: "700",
  },
  loadingBox: {
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    borderColor: colors.slateBorder,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.nightAlt,
  },
  loadingText: {
    color: colors.slateMuted,
  },
  stepList: {
    gap: spacing.md,
  },
  stepCard: {
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    borderColor: colors.slateBorder,
    backgroundColor: colors.nightAlt,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  stepCardComplete: {
    borderColor: colors.success,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  stepHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.surface,
  },
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusPillComplete: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  statusPillPending: {
    backgroundColor: "rgba(249, 115, 22, 0.3)",
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.surface,
  },
  stepDescription: {
    fontSize: 14,
    color: colors.slateText,
    lineHeight: 20,
  },
  stepStatusNote: {
    fontSize: 13,
    fontWeight: "600",
  },
  stepStatusComplete: {
    color: colors.success,
  },
  stepStatusPending: {
    color: "#fb923c",
  },
  stepAction: {
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  stepActionSecondary: {
    backgroundColor: "transparent",
    borderWidth: border.hairline,
    borderColor: colors.surface,
  },
  stepActionText: {
    fontWeight: "700",
    color: colors.night,
  },
  stepActionTextSecondary: {
    color: colors.surface,
  },
  errorText: {
    color: "#f87171",
    fontSize: 13,
  },
});

export default OnboardingHomeScreen;
