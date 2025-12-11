'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase/browser';
import { cn } from '@/lib/utils/cn';
import { isSportType, trackOnboardingEntry } from '@dowhat/shared';

type OnboardingNavLinkProps = {
  className?: string;
};

export function OnboardingNavLink({ className }: OnboardingNavLinkProps) {
  const [pendingSteps, setPendingSteps] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!active) return;
        const user = data.user;
        if (!user) {
          setPendingSteps(0);
          return;
        }
        const [profileResult, traitsResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('primary_sport, reliability_pledge_ack_at')
            .eq('id', user.id)
            .maybeSingle<{ primary_sport: string | null; reliability_pledge_ack_at: string | null }>(),
          supabase
            .from('user_base_traits')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
        ]);
        if (!active) return;
        if (profileResult.error && profileResult.error.code !== 'PGRST116') {
          throw profileResult.error;
        }
        if (traitsResult.error && traitsResult.error.code !== 'PGRST116') {
          throw traitsResult.error;
        }
        const hasTraits = (traitsResult.count ?? 0) >= 5;
        const hasSport = profileResult.data?.primary_sport ? isSportType(profileResult.data.primary_sport) : false;
        const hasPledge = Boolean(profileResult.data?.reliability_pledge_ack_at);
        const pending = [!hasTraits, !hasSport, !hasPledge].filter(Boolean).length;
        setPendingSteps(pending);
      } catch (err) {
        console.warn('[onboarding-nav] failed to load progress', err);
        if (active) setPendingSteps(0);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  if (!pendingSteps) return null;

  const handleClick = () => {
    trackOnboardingEntry({ source: 'nav', platform: 'web', pendingSteps: pendingSteps ?? undefined });
  };

  return (
    <Link
      href="/onboarding"
      className={cn(
        'inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-500 transition',
        className,
      )}
      onClick={handleClick}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      Finish onboarding
      <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold leading-none">{pendingSteps}</span>
    </Link>
  );
}
