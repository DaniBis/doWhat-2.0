import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { trackOnboardingEntry } from "@dowhat/shared";

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
};

export function ReliabilityPledgeBanner({ lastAcknowledgedAt }: ReliabilityPledgeBannerProps) {
  const friendlyAck = formatAckDate(lastAcknowledgedAt);

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
      <div className="space-y-1">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/60 bg-white px-2 py-0.5 text-xs font-semibold text-amber-700">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Reliability onboarding
        </div>
        <p className="text-base font-semibold text-amber-900">Lock your reliability pledge</p>
        <p className="text-amber-800">
          {friendlyAck
            ? `You last confirmed the pledge on ${friendlyAck}. Reconfirm it to keep your reliability score prioritized for new openings.`
            : "Confirm the four Social Sweat commitments so hosts prioritize you when filling last-minute slots."}
        </p>
      </div>
      <Link
        href="/onboarding/reliability-pledge"
        className="inline-flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-500"
        onClick={() => trackOnboardingEntry({ source: "pledge-banner", platform: "web", step: "pledge" })}
      >
        Review pledge
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
