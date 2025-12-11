import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";

import { ReliabilityPledge } from "@/components/onboarding/ReliabilityPledge";
import { createClient } from "@/lib/supabase/server";

const ONBOARDING_PATH = "/onboarding/reliability-pledge";

const highlights = [
  {
    title: "Fill every open slot",
    detail: "Hosts rank players with active pledges higher when scrambling to fill last-minute spots.",
  },
  {
    title: "Boost your reliability score",
    detail: "The pledge feeds into Social Sweat reliability nudges and the badge system.",
  },
  {
    title: "Signal good vibes",
    detail: "Groups trust members who keep their word. This pledge is how you show it.",
  },
];

export const metadata = {
  title: "Reliability Pledge",
  description: "Review Social Sweat’s commitments and lock in your reliability pledge.",
};

export default async function ReliabilityPledgePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const nextParam = encodeURIComponent(ONBOARDING_PATH);
    redirect(`/auth/login?next=${nextParam}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900 text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-12 sm:px-6 lg:flex-row lg:items-start lg:gap-12 lg:py-20">
        <div className="flex-1 space-y-6">
          <Link href="/profile" className="inline-flex items-center text-sm font-semibold text-emerald-300 transition hover:text-white">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to profile
          </Link>
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-sm font-medium text-emerald-200">
              <ShieldCheck className="h-4 w-4" /> Step 3 · Reliability pledge
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Lock the Social Sweat pledge</h1>
            <p className="text-base text-slate-200 sm:text-lg">
              Social Sweat runs on trust. Agree to the four expectations so hosts know you will follow through and reliability nudges stay accurate.
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
        </div>
        <div className="flex-1">
          <ReliabilityPledge className="shadow-2xl shadow-emerald-500/20" />
        </div>
      </div>
    </div>
  );
}
