import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Dumbbell } from "lucide-react";

import { SportSelector } from "@/components/onboarding/SportSelector";
import { createClient } from "@/lib/supabase/server";

const ONBOARDING_PATH = "/onboarding/sports";

const highlights = [
  {
    title: "Stay top of mind",
    detail: "Sessions tagged with your sport bubble up first so you fill open spots faster.",
  },
  {
    title: "Match the right skill",
    detail: "Hosts can see your level when approving players, reducing awkward mismatches.",
  },
  {
    title: "Unlock the new feed",
    detail: "The Find a 4th Player experience relies on these preferences to rank sessions.",
  },
];

export const metadata = {
  title: "Set Your Sport",
  description: "Tell doWhat your primary sport and level so we can personalize discovery.",
};

export default async function SportsOnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const nextParam = encodeURIComponent(ONBOARDING_PATH);
    redirect(`/auth/login?next=${nextParam}`);
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("reliability_pledge_ack_at")
    .eq("id", user.id)
    .maybeSingle<{ reliability_pledge_ack_at: string | null }>();
  const needsReliabilityReminder = !profileRow?.reliability_pledge_ack_at;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:flex-row lg:items-start lg:gap-12 lg:py-20">
        <div className="flex-1 space-y-6">
          <Link href="/profile" className="inline-flex items-center text-sm font-semibold text-emerald-300 transition hover:text-white">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to profile
          </Link>
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-sm font-medium text-emerald-200">
              <Dumbbell className="h-4 w-4" /> Step 2 · Sport & Skill
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Lock your primary sport</h1>
            <p className="text-base text-slate-200 sm:text-lg">
              Choose the sport you host or join most often, then pick the skill band that feels right. We use it for recommendations, reliability nudges, and teaming you up with the right groups.
            </p>
          </div>
          <dl className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-emerald-500/10 backdrop-blur">
            {highlights.map((item) => (
              <div key={item.title} className="flex gap-4">
                <CheckCircle2 className="mt-1 h-5 w-5 flex-shrink-0 text-emerald-300" />
                <div>
                  <dt className="text-sm font-semibold text-white">{item.title}</dt>
                  <dd className="text-sm text-slate-200">{item.detail}</dd>
                </div>
              </div>
            ))}
          </dl>
          {needsReliabilityReminder ? (
            <div className="space-y-2 rounded-3xl border border-amber-200/50 bg-amber-100/10 p-5 text-sm text-amber-300 shadow-lg shadow-amber-500/10">
              <p className="font-semibold text-amber-100">Next up · Reliability pledge</p>
              <p className="text-amber-200/90">
                After saving your sport, head to the pledge step so hosts know you will follow through on every slot.
              </p>
              <Link
                href="/onboarding/reliability-pledge"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500/90 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
              >
                Continue to reliability pledge
              </Link>
            </div>
          ) : (
            <div className="space-y-2 rounded-3xl border border-emerald-200/50 bg-emerald-500/10 p-5 text-sm text-emerald-100 shadow-lg shadow-emerald-500/10">
              <p className="font-semibold text-emerald-50">Reliability pledge locked</p>
              <p className="text-emerald-100/80">
                Thanks for completing the pledge. You can revisit it anytime from your profile if something changes.
              </p>
              <Link
                href="/onboarding/reliability-pledge"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200/70 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20"
              >
                Review or edit pledge
              </Link>
            </div>
          )}
        </div>
        <div className="flex-1">
          <SportSelector className="shadow-2xl shadow-emerald-500/20" />
        </div>
      </div>
    </div>
  );
}
