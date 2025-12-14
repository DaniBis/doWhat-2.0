import React, { useCallback, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PlayStyle, SportType } from "@dowhat/shared";
import {
  PLAY_STYLES,
  SPORT_TYPES,
  getPlayStyleLabel,
  getSkillLabels,
  isPlayStyle,
  isSportType,
  theme,
  trackOnboardingEntry,
} from "@dowhat/shared";

import { supabase } from "../../lib/supabase";

const SPORT_DETAILS: Record<SportType, { title: string; description: string; emoji: string }> = {
  padel: { title: "Padel", description: "Small courts, fast volleys, partner chemistry.", emoji: "🎾" },
  climbing: { title: "Climbing", description: "Routes, boulders, projecting nights.", emoji: "🧗" },
  running: { title: "Running", description: "Road, trail, tempo, recovery miles.", emoji: "🏃" },
  other: { title: "Something else", description: "Another sport we haven’t listed yet.", emoji: "✨" },
};

const PLAY_STYLE_NOTES: Record<PlayStyle, string> = {
  competitive: "Score-driven, fast paced, rankings-focused sessions.",
  fun: "Easygoing runs, socials, and vibe-first sessions.",
};

const { colors, spacing, radius, border, shadow } = theme;

const SportsOnboardingScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedSport, setSelectedSport] = useState<SportType | null>(null);
  const [skillLevel, setSkillLevel] = useState<string>("");
  const [playStyle, setPlayStyle] = useState<PlayStyle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const skillOptions = useMemo(() => getSkillLabels(selectedSport ?? undefined), [selectedSport]);

  useEffect(() => {
    if (!selectedSport) {
      setSkillLevel("");
      return;
    }
    const defaultSkill = skillOptions[0] ?? "";
    setSkillLevel((prev) => (prev && skillOptions.includes(prev) ? prev : defaultSkill));
  }, [selectedSport, skillOptions]);

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!active) return;
        const user = auth?.user;
        if (!user) {
          setError("Please sign in to continue.");
          return;
        }
        setUserId(user.id);
        const { data: profileRow, error: profileError } = await supabase
          .from("profiles")
          .select("primary_sport, play_style")
          .eq("id", user.id)
          .maybeSingle<{ primary_sport: SportType | null; play_style: PlayStyle | null }>();
        if (!active) return;
        if (profileError && profileError.code !== "PGRST116") {
          throw profileError;
        }
        const normalized = isSportType(profileRow?.primary_sport) ? profileRow?.primary_sport ?? null : null;
        setSelectedSport(normalized);
        const normalizedPlayStyle = isPlayStyle(profileRow?.play_style) ? profileRow?.play_style ?? null : null;
        setPlayStyle(normalizedPlayStyle);
        if (normalized) {
          const { data: sportProfile, error: sportProfileError } = await supabase
            .from("user_sport_profiles")
            .select("skill_level")
            .eq("user_id", user.id)
            .eq("sport", normalized)
            .maybeSingle<{ skill_level: string | null }>();
          if (!active) return;
          if (sportProfileError && sportProfileError.code !== "PGRST116") {
            throw sportProfileError;
          }
          if (sportProfile?.skill_level) {
            setSkillLevel(sportProfile.skill_level);
          }
        }
      } catch (err) {
        console.error("[sports-onboarding] load failed", err);
        if (active) setError("Could not load your sport preferences. Try again shortly.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  const handleSelectSport = useCallback((sport: SportType) => {
    setSelectedSport(sport);
    setError(null);
    setSuccess(null);
  }, []);

  const handleSelectSkill = useCallback((level: string) => {
    setSkillLevel(level);
    setError(null);
    setSuccess(null);
  }, []);

  const handleSelectPlayStyle = useCallback((style: PlayStyle) => {
    setPlayStyle(style);
    setError(null);
    setSuccess(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!userId || !selectedSport || !skillLevel || !playStyle) {
      setError("Select a sport, skill level, and play style to continue.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const timestamp = new Date().toISOString();
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          { id: userId, primary_sport: selectedSport, play_style: playStyle, updated_at: timestamp },
          { onConflict: "id" }
        );
      if (profileError) throw profileError;

      const { error: sportProfileError } = await supabase
        .from("user_sport_profiles")
        .upsert(
          {
            user_id: userId,
            sport: selectedSport,
            skill_level: skillLevel,
            updated_at: timestamp,
          },
          { onConflict: "user_id,sport" }
        );
      if (sportProfileError) throw sportProfileError;

      setSuccess("Saved! Let’s set your reliability next.");
      trackOnboardingEntry({
        source: "sport-selector",
        platform: "mobile",
        step: "pledge",
        steps: ["pledge"],
        pendingSteps: 1,
        nextStep: "/onboarding/reliability-pledge",
      });
      router.replace("/onboarding/reliability-pledge");
    } catch (err) {
      console.error("[sports-onboarding] save failed", err);
      setError("Could not save your preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [playStyle, skillLevel, selectedSport, userId]);

  const ready = Boolean(userId && selectedSport && skillLevel && playStyle && !saving);

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top || 24, paddingBottom: insets.bottom || 24 }]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Choose your primary sport</Text>
        <Text style={styles.description}>
          We’ll prioritize sessions, teammates, and alerts that match your sport & level so you can fill open spots faster.
        </Text>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.accentSky} />
            <Text style={styles.loadingText}>Loading your sport profile…</Text>
          </View>
        ) : (
          <View style={styles.sportGrid}>
            {SPORT_TYPES.map((sport) => {
              const detail = SPORT_DETAILS[sport];
              const selected = selectedSport === sport;
              return (
                <Pressable
                  key={sport}
                  onPress={() => handleSelectSport(sport)}
                  disabled={saving}
                  style={[styles.sportCard, selected && styles.sportCardSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={styles.sportEmoji}>{detail.emoji}</Text>
                  <Text style={styles.sportTitle}>{detail.title}</Text>
                  <Text style={styles.sportSummary}>{detail.description}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.skillBlock}>
          <Text style={styles.skillHeading}>Skill Level</Text>
          {selectedSport ? (
            <View style={styles.skillChipsWrap}>
              {skillOptions.map((level) => {
                const active = skillLevel === level;
                return (
                  <Pressable
                    key={level}
                    onPress={() => handleSelectSkill(level)}
                    disabled={saving}
                    style={[styles.skillChip, active && styles.skillChipActive]}
                  >
                    <Text style={[styles.skillChipText, active && styles.skillChipTextActive]}>{level}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.skillPlaceholder}>Pick a sport above to see detailed levels.</Text>
          )}
        </View>

        <View style={styles.playStyleBlock}>
          <Text style={styles.playStyleHeading}>Play style</Text>
          <View style={styles.playStyleGrid}>
            {PLAY_STYLES.map((style) => {
              const active = playStyle === style;
              return (
                <Pressable
                  key={style}
                  onPress={() => handleSelectPlayStyle(style)}
                  disabled={saving}
                  style={[styles.playStyleCard, active && styles.playStyleCardActive]}
                >
                  <Text style={[styles.playStyleTitle, active && styles.playStyleTitleActive]}>
                    {getPlayStyleLabel(style)}
                  </Text>
                  <Text style={styles.playStyleNote}>{PLAY_STYLE_NOTES[style]}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? <Text style={styles.successText}>{success}</Text> : null}

        <Pressable
          onPress={handleSave}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          testID="sport-onboarding-save"
          style={[styles.saveButton, ready ? styles.saveButtonReady : styles.saveButtonDisabled]}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save and continue</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.night,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl + spacing.sm,
    gap: spacing.lg,
  },
  heading: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.surface,
  },
  description: {
    fontSize: 15,
    color: colors.slateText,
  },
  loadingBox: {
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    borderColor: colors.slateBorder,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.nightAlt,
  },
  loadingText: {
    color: colors.slateMuted,
  },
  sportGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sportCard: {
    width: "48%",
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    borderColor: colors.slateBorder,
    padding: spacing.md,
    backgroundColor: colors.nightAlt,
  },
  sportCardSelected: {
    borderColor: colors.success,
    backgroundColor: colors.emeraldSurface,
  },
  sportEmoji: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  sportTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.surface,
  },
  sportSummary: {
    fontSize: 13,
    color: colors.slateText,
    marginTop: spacing.xs,
  },
  skillBlock: {
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    borderColor: colors.slateBorder,
    padding: spacing.md,
    backgroundColor: colors.nightAlt,
    gap: spacing.xs,
  },
  skillHeading: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.surface,
  },
  skillPlaceholder: {
    color: colors.slateMuted,
  },
  skillChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  skillChip: {
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    borderColor: colors.slateBorder,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: "transparent",
  },
  skillChipActive: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  skillChipText: {
    color: colors.slateText,
    fontSize: 13,
  },
  skillChipTextActive: {
    color: colors.emeraldInk,
    fontWeight: "700",
  },
  errorText: {
    color: colors.danger,
  },
  successText: {
    color: colors.success,
  },
  saveButton: {
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    ...shadow.card,
  },
  playStyleBlock: {
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    borderColor: colors.slateBorder,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.nightAlt,
  },
  playStyleHeading: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.surface,
  },
  playStyleGrid: {
    gap: spacing.sm,
  },
  playStyleCard: {
    borderRadius: radius.md,
    borderWidth: border.hairline,
    borderColor: colors.slateBorder,
    padding: spacing.md,
    backgroundColor: colors.nightAlt,
  },
  playStyleCardActive: {
    borderColor: colors.success,
    backgroundColor: colors.emeraldSurface,
  },
  playStyleTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.slateText,
  },
  playStyleTitleActive: {
    color: colors.surface,
  },
  playStyleNote: {
    marginTop: spacing.xs,
    fontSize: 13,
    color: colors.slateMuted,
  },
  saveButtonReady: {
    backgroundColor: colors.success,
  },
  saveButtonDisabled: {
    backgroundColor: colors.ink80,
  },
  saveButtonText: {
    color: colors.emeraldInk,
    fontWeight: "700",
    fontSize: 16,
  },
});

export default SportsOnboardingScreen;
