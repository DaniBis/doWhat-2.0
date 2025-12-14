"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";
import type { PlayStyle, SportType } from "@dowhat/shared";
import {
  PLAY_STYLES,
  PLAY_STYLE_LABELS,
  SPORT_TYPES,
  getSkillLabels,
  isPlayStyle,
  isSportType,
  theme,
  trackOnboardingEntry,
} from "@dowhat/shared";

const { colors, spacing, radius, border } = theme;

const SPORT_DETAILS: Record<SportType, { label: string; description: string; emoji: string }> = {
  padel: {
    label: "Padel",
    description: "Doubles tactics, fast volleys.",
    emoji: "🎾",
  },
  climbing: {
    label: "Climbing",
    description: "Routes, boulders, and community sends.",
    emoji: "🧗",
  },
  running: {
    label: "Running",
    description: "Road, trail, tempo, or easy miles.",
    emoji: "🏃",
  },
  other: {
    label: "Something else",
    description: "Pick this when your sport isn’t listed yet.",
    emoji: "✨",
  },
};

const PLAY_STYLE_DESCRIPTIONS: Record<PlayStyle, string> = {
  competitive: "Score-driven, fast paced, rankings-focused sessions.",
  fun: "Easygoing runs, socials, and vibe-first sessions.",
};

type SportSelectorProps = {
  className?: string;
};

type ProfileRow = {
  primary_sport: SportType | null;
  play_style: PlayStyle | null;
};

type SportProfileRow = {
  skill_level: string | null;
};

export function SportSelector({ className }: SportSelectorProps) {
  const router = useRouter();
  const [selectedSport, setSelectedSport] = useState<SportType | null>(null);
  const [skillLevel, setSkillLevel] = useState("");
  const [playStyle, setPlayStyle] = useState<PlayStyle | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
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
    setSkillLevel((prev) => {
      if (prev && skillOptions.includes(prev)) {
        return prev;
      }
      return defaultSkill;
    });
  }, [selectedSport, skillOptions]);

  useEffect(() => {
    try {
      router.prefetch("/onboarding/reliability-pledge");
    } catch {
      /* ignore prefetch failures */
    }
  }, [router]);


  useEffect(() => {
    let isMounted = true;
    const loadProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!isMounted) return;
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
          .maybeSingle<ProfileRow>();
        if (!isMounted) return;
        if (profileError && profileError.code !== "PGRST116") {
          throw profileError;
        }
        const profileSport = profileRow?.primary_sport ?? null;
        const normalizedSport = isSportType(profileSport) ? profileSport : null;
        setSelectedSport(normalizedSport);
        const normalizedPlayStyle = isPlayStyle(profileRow?.play_style) ? profileRow?.play_style : null;
        setPlayStyle(normalizedPlayStyle);

        if (normalizedSport) {
          const { data: sportProfile, error: sportProfileError } = await supabase
            .from("user_sport_profiles")
            .select("skill_level")
            .eq("user_id", user.id)
            .eq("sport", normalizedSport)
            .maybeSingle<SportProfileRow>();
          if (!isMounted) return;
          if (sportProfileError && sportProfileError.code !== "PGRST116") {
            throw sportProfileError;
          }
          if (sportProfile?.skill_level) {
            setSkillLevel(sportProfile.skill_level);
          }
        }
      } catch (err) {
        console.error("Failed to load sport preferences", err);
        if (isMounted) {
          setError("Could not load your sport preferences.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelect = useCallback((sport: SportType) => {
    setError(null);
    setSuccess(null);
    setSelectedSport(sport);
  }, []);

  const handleSkillChipSelect = useCallback((label: string) => {
    setError(null);
    setSuccess(null);
    setSkillLevel(label);
  }, []);

  const handlePlayStyleSelect = useCallback((style: PlayStyle) => {
    setError(null);
    setSuccess(null);
    setPlayStyle(style);
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
      const profileUpdate = {
        id: userId,
        primary_sport: selectedSport,
        play_style: playStyle,
        updated_at: new Date().toISOString(),
      };
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(profileUpdate, { onConflict: "id" });
      if (profileError) {
        throw profileError;
      }

      const { error: sportProfileError } = await supabase
        .from("user_sport_profiles")
        .upsert(
          {
            user_id: userId,
            sport: selectedSport,
            skill_level: skillLevel,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,sport" }
        );
      if (sportProfileError) {
        throw sportProfileError;
      }
      setSuccess("Preferences saved! Redirecting to reliability pledge…");
      trackOnboardingEntry({
        source: "sport-selector",
        platform: "web",
        step: "pledge",
        steps: ["pledge"],
        pendingSteps: 1,
        nextStep: "/onboarding/reliability-pledge",
      });
      router.push("/onboarding/reliability-pledge");
    } catch (err) {
      console.error("Failed to save sport preferences", err);
      setError("Could not save your preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [playStyle, router, skillLevel, selectedSport, userId]);

  const canSave = Boolean(userId && selectedSport && skillLevel && playStyle && !saving);

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="space-y-xs">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-teal">Sport & Skill</p>
        <h2 className="text-2xl font-semibold text-ink">Pick your primary sport</h2>
        <p className="text-sm text-ink-medium">
          This helps us personalize upcoming sessions, partner suggestions, and reliability nudges.
        </p>
      </CardHeader>
      <CardContent className="space-y-xl">
        {loading && (
          <div className="flex items-center gap-xs rounded-xl border border-dashed border-midnight-border/40 px-md py-sm text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Preparing your sport profile…
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-md py-sm text-sm text-red-700">{error}</div>
        )}
        <div className="grid gap-sm sm:grid-cols-3">
          {SPORT_TYPES.map((sport) => {
            const { label, description, emoji } = SPORT_DETAILS[sport];
            const selected = selectedSport === sport;
            return (
              <button
                key={sport}
                type="button"
                onClick={() => handleSelect(sport)}
                disabled={saving}
                className={cn(
                  "flex flex-col rounded-2xl border px-md py-md text-left transition",
                  selected
                    ? "border-brand-teal bg-brand-teal/10 text-brand-dark"
                    : "border-midnight-border/40 bg-surface text-ink-strong hover:border-brand-teal/30",
                )}
                aria-pressed={selected}
              >
                <span className="text-3xl" aria-hidden>
                  {emoji}
                </span>
                <span className="mt-sm text-lg font-semibold">{label}</span>
                <span className="text-sm text-ink-muted">{description}</span>
              </button>
            );
          })}
        </div>
        <div className="space-y-xs">
          <p className="text-sm font-medium text-ink-strong">Skill level</p>
          {selectedSport ? (
            <div className="flex flex-wrap gap-xs" role="group" aria-label="Skill level options">
              {skillOptions.map((label) => {
                const active = skillLevel === label;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleSkillChipSelect(label)}
                    disabled={saving}
                    aria-pressed={active}
                    className="text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal"
                    style={{
                      borderRadius: radius.pill,
                      borderWidth: border.hairline,
                      borderStyle: "solid",
                      borderColor: active ? colors.brandTeal : colors.ink20,
                      backgroundColor: active ? colors.brandTeal : "transparent",
                      color: active ? colors.surface : colors.ink60,
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      boxShadow: active ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-ink-muted">Choose a primary sport first.</p>
          )}
        </div>
        <div className="space-y-xs">
          <p className="text-sm font-medium text-ink-strong">Play style</p>
          <div className="grid gap-sm sm:grid-cols-2">
            {PLAY_STYLES.map((style) => {
              const selected = playStyle === style;
              return (
                <button
                  key={style}
                  type="button"
                  onClick={() => handlePlayStyleSelect(style)}
                  disabled={saving}
                  className={cn(
                    "rounded-2xl border px-md py-sm text-left text-sm transition",
                    selected
                      ? "border-brand-teal bg-brand-teal/10 text-brand-dark"
                      : "border-midnight-border/40 bg-surface text-ink-strong hover:border-brand-teal/30",
                  )}
                  aria-pressed={selected}
                >
                  <span className="text-base font-semibold">{PLAY_STYLE_LABELS[style]}</span>
                  <span className="mt-xxs block text-xs text-ink-muted">{PLAY_STYLE_DESCRIPTIONS[style]}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-sm text-sm">
          {success && (
            <span className="inline-flex items-center gap-xs text-brand-teal">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              {success}
            </span>
          )}
          <Button onClick={handleSave} disabled={!canSave} className="ml-auto flex min-w-[180px] items-center justify-center gap-xs">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                <span>Saving…</span>
              </>
            ) : (
              "Save preferences"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
