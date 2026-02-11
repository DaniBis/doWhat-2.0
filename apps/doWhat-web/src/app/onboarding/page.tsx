import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, Circle, Sparkles } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";
import {
  derivePendingOnboardingSteps,
  getSportLabel,
  hasCompletedSportStep,
  isPlayStyle,
  isSportType,
  ONBOARDING_TRAIT_GOAL,
  trackOnboardingEntry,
  type OnboardingStep,
} from "@dowhat/shared";

type OnboardingStepDefinition = {
  id: OnboardingStep;
  title: string;
  description: string;
  href: Route;
  actionLabel: string;
};

type EnrichedOnboardingStep = OnboardingStepDefinition & {
  complete: boolean;
  statusNote: string;
};

const STEP_ORDER: ReadonlyArray<OnboardingStepDefinition> = [
  {
    id: "traits",
    title: "Step 1 · Vibes",
    description: "Pick five base traits so your vibe shows up across discovery, people filters, and invites.",
    href: "/onboarding/traits",
    actionLabel: "Go to trait onboarding",
  },
  {
    id: "sport",
    title: "Step 2 · Sport & skill",
    description: "Tell us the sport you host or play most often so we can fill openings with the right crew.",
    href: "/onboarding/sports",
    actionLabel: "Set sport preferences",
  },
  {
    id: "pledge",
    title: "Step 3 · Reliability pledge",
    description: "Confirm the four doWhat commitments so hosts know they can count on you.",
    href: "/onboarding/reliability-pledge",
    actionLabel: "Review pledge",
  },
] as const;

const formatAckDate = (value?: string | null) => {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
  } catch {
    return new Date(value).toDateString();
  }
};

export const metadata = {
  title: "doWhat Onboarding",
  description: "Track your onboarding progress (traits, sport, reliability pledge) and jump back into any step.",
};

export default async function OnboardingHomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent("/onboarding")}`);
  }

  const [{ data: profileRow, error: profileError }, traitsCountResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("primary_sport, play_style, reliability_pledge_ack_at")
      .eq("id", user.id)
      .maybeSingle<{ primary_sport: string | null; play_style: string | null; reliability_pledge_ack_at: string | null }>(),
    supabase
      .from("user_base_traits")
      .select("trait_id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  if (profileError && profileError.code !== "PGRST116") {
    throw profileError;
  }

  if (traitsCountResult.error && traitsCountResult.error.code !== "PGRST116") {
    throw traitsCountResult.error;
  }

  const baseTraitCount = traitsCountResult.count ?? 0;
  const normalizedTraitCount = Math.min(baseTraitCount, ONBOARDING_TRAIT_GOAL);
  const hasTraits = normalizedTraitCount >= ONBOARDING_TRAIT_GOAL;
  const normalizedSport = profileRow?.primary_sport && isSportType(profileRow.primary_sport) ? profileRow.primary_sport : null;
  const normalizedPlayStyle = profileRow?.play_style && isPlayStyle(profileRow.play_style) ? profileRow.play_style : null;
  let sportSkillLevel: string | null = null;
  if (normalizedSport) {
    const { data: sportProfileRow, error: sportProfileError } = await supabase
      .from("user_sport_profiles")
      .select("skill_level")
      .eq("user_id", user.id)
      .eq("sport", normalizedSport)
      .maybeSingle<{ skill_level: string | null }>();
    if (sportProfileError && sportProfileError.code !== "PGRST116") {
      throw sportProfileError;
    }
    sportSkillLevel = sportProfileRow?.skill_level ?? null;
  }
  const sportComplete = hasCompletedSportStep({
    primarySport: normalizedSport,
    playStyle: normalizedPlayStyle,
    skillLevel: sportSkillLevel,
  });
  const pledgeAckAt = profileRow?.reliability_pledge_ack_at ?? null;
  const hasPledge = Boolean(pledgeAckAt);
  const formattedAck = formatAckDate(pledgeAckAt);
  const pendingStepIds = derivePendingOnboardingSteps({
    traitCount: baseTraitCount,
    primarySport: normalizedSport,
    playStyle: normalizedPlayStyle,
    skillLevel: sportSkillLevel,
    pledgeAckAt,
  });
  const pendingStepCount = pendingStepIds.length;

  const steps: EnrichedOnboardingStep[] = STEP_ORDER.map((step) => {
    switch (step.id) {
      case "traits":
        return {
          ...step,
          complete: hasTraits,
          statusNote: hasTraits ? `Completed (${normalizedTraitCount} vibes)` : `${normalizedTraitCount}/${ONBOARDING_TRAIT_GOAL} vibes saved`,
        };
      case "sport": {
        const sportLabel = normalizedSport ? getSportLabel(normalizedSport) : null;
        return {
          ...step,
          complete: sportComplete,
          statusNote: sportComplete && sportLabel ? `Primary sport: ${sportLabel}` : "Sport or skill missing",
        };
      }
      case "pledge":
        return {
          ...step,
          complete: hasPledge,
          statusNote: hasPledge && formattedAck ? `Acknowledged ${formattedAck}` : "Pledge pending",
        };
      default:
        return {
          ...step,
          complete: false,
          statusNote: "Pending",
        };
    }
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-12 sm:px-6 lg:py-20">
        <header className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-200">
            <Sparkles className="h-4 w-4" aria-hidden /> doWhat onboarding
          </div>
          <div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Finish the Step 0 checklist</h1>
            <p className="mt-3 text-base text-slate-200 sm:text-lg">
              Lock your vibe, sport, and reliability pledge so doWhat can prioritize you for last-minute sessions and reliable crews.
            </p>
          </div>
        </header>
        <div className="grid gap-6 lg:grid-cols-3">
          {steps.map((step) => (
            <article key={step.id} className="flex flex-col rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-emerald-500/10 backdrop-blur">
              <div className="flex items-center gap-3 text-sm font-semibold">
                <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full border", step.complete ? "border-emerald-400 bg-emerald-400/20 text-emerald-200" : "border-white/30 bg-white/5 text-white/70")}
                  aria-hidden
                >
                  {step.complete ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                </span>
                <span>{step.title}</span>
              </div>
              <p className="mt-4 text-sm text-slate-200">{step.description}</p>
              <p className={cn("mt-3 text-xs font-semibold", step.complete ? "text-emerald-300" : "text-amber-200")}>{step.statusNote}</p>
              <Link
                href={step.href}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
                onClick={() =>
                  trackOnboardingEntry({
                    source: "onboarding-card",
                    platform: "web",
                    step: step.id,
                    steps: pendingStepCount > 0 ? pendingStepIds : [step.id],
                    pendingSteps: pendingStepCount,
                    nextStep: step.href,
                  })
                }
              >
                {step.complete ? "Review step" : step.actionLabel}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
