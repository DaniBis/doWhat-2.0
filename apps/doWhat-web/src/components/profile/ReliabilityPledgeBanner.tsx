import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { trackOnboardingEntry, type OnboardingStep } from "@dowhat/shared";

import { ONBOARDING_STEP_ROUTES } from "@/lib/onboardingSteps";

const formatAckDate = (ack?: string | null) => {
  if (!ack) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(ack));
  } catch {
    return new Date(ack).toDateString();
  }
};

type ReliabilityPledgeBannerProps = {
  lastAcknowledgedAt?: string | null;
  steps?: OnboardingStep[];
};

const DEFAULT_PLEDGE_STEPS: OnboardingStep[] = ["pledge"];

export function ReliabilityPledgeBanner({ lastAcknowledgedAt, steps }: ReliabilityPledgeBannerProps) {
  const friendlyAck = formatAckDate(lastAcknowledgedAt);
  const effectiveSteps: OnboardingStep[] = steps && steps.length > 0 ? steps : DEFAULT_PLEDGE_STEPS;
  const pendingCount = effectiveSteps.length;

  return (
    <div className="mb-lg flex flex-wrap items-center justify-between gap-md rounded-xl border border-feedback-warning/50 bg-surface-alt p-lg text-sm text-ink-strong shadow-card">
      <div className="space-y-xxs">
        <div className="inline-flex items-center gap-xxs rounded-full border border-feedback-warning/50 bg-surface px-sm py-hairline text-xs font-semibold text-feedback-warning">
          <ShieldCheck className="h-4 w-4 text-feedback-warning" aria-hidden /> Reliability onboarding
        </div>
        <p className="text-base font-semibold text-ink-strong">Lock your reliability pledge</p>
        <p className="text-ink-medium">
          {friendlyAck
            ? `You last confirmed the pledge on ${friendlyAck}. Reconfirm it to keep your reliability score prioritized for new openings.`
            : "Confirm the four doWhat commitments so hosts prioritize you when filling last-minute slots."}
        </p>
      </div>
      <Link
        href={ONBOARDING_STEP_ROUTES.pledge}
        className="inline-flex items-center gap-xs rounded-full bg-feedback-warning px-lg py-sm text-sm font-semibold text-white shadow-card transition hover:bg-feedback-warning/90 focus:outline-none focus:ring-2 focus:ring-feedback-warning focus:ring-offset-2"
        onClick={() =>
          trackOnboardingEntry({
            source: "pledge-banner",
            platform: "web",
            step: "pledge",
            steps: effectiveSteps,
            pendingSteps: pendingCount,
            nextStep: ONBOARDING_STEP_ROUTES.pledge,
          })
        }
      >
        Review pledge
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
