import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { trackOnboardingEntry, type OnboardingStep } from "@dowhat/shared";

const STEP_LABELS: Record<OnboardingStep, string> = {
  traits: "Pick 5 base traits",
  sport: "Set your sport & skill",
  pledge: "Confirm the reliability pledge",
};

type OnboardingProgressBannerProps = {
  steps: OnboardingStep[];
};

export function OnboardingProgressBanner({ steps }: OnboardingProgressBannerProps) {
  if (steps.length === 0) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/70 bg-white px-2 py-0.5 text-xs font-semibold text-emerald-700">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Step 0 progress
        </div>
        <p className="text-base font-semibold text-emerald-900">Finish your Social Sweat onboarding</p>
        <p>Complete the remaining steps so hosts prioritize you for last-minute slots.</p>
        <ul className="list-inside list-disc text-emerald-800">
          {steps.map((step) => (
            <li key={step}>{STEP_LABELS[step]}</li>
          ))}
        </ul>
      </div>
      <Link
        href="/onboarding"
        className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500"
        onClick={() => trackOnboardingEntry({ source: "profile-banner", platform: "web", steps })}
      >
        Open onboarding hub
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
