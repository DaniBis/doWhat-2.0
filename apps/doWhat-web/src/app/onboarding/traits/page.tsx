import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";

import { TraitOnboardingSection } from "@/components/traits/TraitOnboardingSection";
import { createClient } from "@/lib/supabase/server";

const ONBOARDING_PATH = "/onboarding/traits";

const checklist = [
  {
    title: "Pick exactly five traits",
    detail: "Your base vibes help us seed recommendations and unlock profile hints immediately.",
  },
  {
    title: "Keep everything editable",
    detail: "You can revisit this screen anytime from /profile and refresh your stack as it evolves.",
  },
  {
    title: "Unlock votes faster",
    detail: "Once sessions end, attendees can nominate new traits on top of your base picks.",
  },
];

export const metadata = {
  title: "Choose Your Traits",
  description: "Set your five base traits so discovery, profiles, and people filters reflect your vibe.",
};

export default async function TraitOnboardingPage() {
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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:flex-row lg:items-start lg:gap-12 lg:py-20">
        <div className="flex-1 space-y-6">
          <Link href="/profile" className="inline-flex items-center text-sm font-semibold text-emerald-300 transition hover:text-white">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to profile
          </Link>
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-sm font-medium text-emerald-200">
              <Sparkles className="h-4 w-4" /> Step 3 · Personalize
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Lock in your base vibe
            </h1>
            <p className="text-base text-slate-200 sm:text-lg">
              Choose the five traits that describe you best. We use them to seed discovery, tailor people filters, and give teammates context before they meet you.
            </p>
          </div>
          <dl className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-emerald-500/10 backdrop-blur">
            {checklist.map((item) => (
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
          <TraitOnboardingSection className="shadow-2xl shadow-emerald-500/20" />
        </div>
      </div>
    </div>
  );
}
