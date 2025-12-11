import Link from "next/link";
import { ArrowRight, Dumbbell } from "lucide-react";
import { trackOnboardingEntry } from "@dowhat/shared";

type SportOnboardingBannerProps = {
  skillLevel?: string | null;
};

export function SportOnboardingBanner({ skillLevel }: SportOnboardingBannerProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-blue-50/80 p-4 text-sm text-slate-900">
      <div className="space-y-1">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/60 bg-white px-2 py-0.5 text-xs font-semibold text-blue-600">
          <Dumbbell className="h-3.5 w-3.5" aria-hidden /> Sport onboarding
        </div>
        <p className="text-base font-semibold text-slate-900">Set your sport & skill</p>
        <p className="text-slate-700">
          Choose your primary sport and level so we can prioritize the right sessions{skillLevel ? ` (currently ${skillLevel}).` : " and match you with teammates faster."}
        </p>
      </div>
      <Link
        href="/onboarding/sports"
        className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500"
        onClick={() => trackOnboardingEntry({ source: "sport-banner", platform: "web", step: "sport" })}
      >
        Go to sport onboarding
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
