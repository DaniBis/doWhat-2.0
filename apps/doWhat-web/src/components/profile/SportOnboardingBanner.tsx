import Link from "next/link";
import { ArrowRight, Dumbbell } from "lucide-react";
import { trackOnboardingEntry, type OnboardingStep } from "@dowhat/shared";

import { ONBOARDING_STEP_ROUTES } from "@/lib/onboardingSteps";

type SportOnboardingBannerProps = {
  skillLevel?: string | null;
  steps?: OnboardingStep[];
};

const DEFAULT_SPORT_STEPS: OnboardingStep[] = ["sport"];

export function SportOnboardingBanner({ skillLevel, steps }: SportOnboardingBannerProps) {
  const effectiveSteps: OnboardingStep[] = steps && steps.length > 0 ? steps : DEFAULT_SPORT_STEPS;
  const pendingCount = effectiveSteps.length;
  return (
    <div className="mb-lg flex flex-wrap items-center justify-between gap-md rounded-xl border border-brand-teal/40 bg-surface-alt p-lg text-sm text-ink-strong shadow-card">
      <div className="space-y-xxs">
        <div className="inline-flex items-center gap-xxs rounded-full border border-brand-teal/50 bg-surface px-sm py-hairline text-xs font-semibold text-brand-dark">
          <Dumbbell className="h-4 w-4 text-brand-teal" aria-hidden /> Sport onboarding
        </div>
        <p className="text-base font-semibold text-ink-strong">Set your sport & skill</p>
        <p className="text-ink-medium">
          Choose your primary sport and level so we can prioritize the right sessions{skillLevel ? " and match you with teammates faster." : " and match you with teammates faster."}
        </p>
        {skillLevel && (
          <div className="inline-flex items-center gap-xxs rounded-full border border-midnight-border/40 bg-surface px-sm py-hairline text-xs font-semibold text-ink-strong">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-teal" aria-hidden />
            Current skill: {skillLevel}
          </div>
        )}
      </div>
      <Link
        href={ONBOARDING_STEP_ROUTES.sport}
        className="inline-flex items-center gap-xs rounded-full bg-brand-teal px-lg py-sm text-sm font-semibold text-white shadow-card transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-teal focus:ring-offset-2"
        onClick={() =>
          trackOnboardingEntry({
            source: "sport-banner",
            platform: "web",
            step: "sport",
            steps: effectiveSteps,
            pendingSteps: pendingCount,
            nextStep: ONBOARDING_STEP_ROUTES.sport,
          })
        }
      >
        Go to sport onboarding
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
