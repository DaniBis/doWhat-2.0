import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Sparkles } from "lucide-react";
import { trackOnboardingEntry, type OnboardingStep } from "@dowhat/shared";

import { ONBOARDING_STEP_LABELS, ONBOARDING_STEP_ROUTES } from "@/lib/onboardingSteps";

type OnboardingProgressBannerProps = {
  steps: OnboardingStep[];
};

const ONBOARDING_HUB_ROUTE: Route = "/onboarding";

export function OnboardingProgressBanner({ steps }: OnboardingProgressBannerProps) {
  if (steps.length === 0) return null;

  const pendingSteps = steps.length;
  const primaryStep = steps[0];
  const nextStepHref: Route = primaryStep ? ONBOARDING_STEP_ROUTES[primaryStep] : ONBOARDING_HUB_ROUTE;
  const primaryStepLabel = primaryStep ? ONBOARDING_STEP_LABELS[primaryStep] : "Finish onboarding";
  const pendingLabel = pendingSteps === 1 ? "1 step" : `${pendingSteps} steps`;
  const encouragementCopy =
    pendingSteps === 1
      ? "Just one more action to unlock full Social Sweat access."
      : `${pendingLabel} remain — finish them so hosts prioritize you for open slots.`;
  const ctaLabel = primaryStep ? "Go to next step" : "Open onboarding hub";

  return (
    <div className="mb-lg flex flex-wrap items-center justify-between gap-md rounded-xl border border-midnight-border bg-surface-alt p-lg text-sm text-ink-strong shadow-card">
      <div className="space-y-sm">
        <div className="inline-flex items-center gap-xxs rounded-full border border-brand-teal/40 bg-surface px-sm py-hairline text-xs font-semibold text-brand-dark">
          <Sparkles className="h-4 w-4 text-brand-teal" aria-hidden /> Step 0 progress
        </div>
        <p className="text-base font-semibold text-ink-strong">Finish your Social Sweat onboarding</p>
        <p>{encouragementCopy}</p>
        <p className="text-sm font-semibold text-ink-strong">Next up: {primaryStepLabel}</p>
        <div className="flex flex-wrap gap-xs text-ink-strong">
          {steps.map((step) => (
            <span
              key={step}
              className="inline-flex items-center gap-xxs rounded-full border border-midnight-border/40 bg-surface px-sm py-hairline text-xs font-semibold"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-brand-teal" aria-hidden />
              {ONBOARDING_STEP_LABELS[step]}
            </span>
          ))}
        </div>
      </div>
      <Link
        href={nextStepHref}
        className="inline-flex items-center gap-xs rounded-full bg-brand-teal px-lg py-sm text-sm font-semibold text-white shadow-card transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-teal focus:ring-offset-2"
        onClick={() =>
          trackOnboardingEntry({
            source: "profile-banner",
            platform: "web",
            steps,
            pendingSteps,
            step: primaryStep,
            nextStep: nextStepHref,
          })
        }
      >
        {ctaLabel}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
