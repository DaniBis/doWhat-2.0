import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, HeartHandshake } from "lucide-react";

import { CoreValuesForm } from "@/components/onboarding/CoreValuesForm";
import { createClient } from "@/lib/supabase/server";
import { sanitizeRedirectPath } from "@/lib/access/coreAccess";

const ONBOARDING_PATH = "/onboarding/core-values";

const checklist = [
  {
    title: "Type 3 values you actually live by",
    detail: "We use these as trust and compatibility signals when ranking sessions and people.",
  },
  {
    title: "Keep them short and specific",
    detail: "Clear words make it easier for people to decide if your vibe matches theirs.",
  },
  {
    title: "You can edit later from profile",
    detail: "Values can evolve as your activity style changes over time.",
  },
];

type CoreValuesPageProps = {
  searchParams?: { next?: string };
};

export default async function OnboardingCoreValuesPage({ searchParams }: CoreValuesPageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const nextParam = encodeURIComponent(ONBOARDING_PATH);
    redirect(`/auth?intent=signin&next=${nextParam}`);
  }

  const requestedNext = sanitizeRedirectPath(searchParams?.next ?? null, "/onboarding/reliability-pledge");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:flex-row lg:items-start lg:gap-12 lg:py-20">
        <div className="flex-1 space-y-6">
          <Link href="/onboarding" className="inline-flex items-center text-sm font-semibold text-emerald-300 transition hover:text-white">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to onboarding
          </Link>
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-sm font-medium text-emerald-200">
              <HeartHandshake className="h-4 w-4" /> Core values onboarding
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Define your values
            </h1>
            <p className="text-base text-slate-200 sm:text-lg">
              Add the three values that shape how you show up in sessions. This keeps recommendations full but honest before social signals scale.
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
          <CoreValuesForm redirectTo={requestedNext} className="shadow-2xl shadow-emerald-500/20" />
        </div>
      </div>
    </div>
  );
}
