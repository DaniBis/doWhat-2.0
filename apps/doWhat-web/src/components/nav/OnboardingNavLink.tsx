'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase/browser';
import { cn } from '@/lib/utils/cn';
import { ONBOARDING_STEP_LABELS, ONBOARDING_STEP_ROUTES } from '@/lib/onboardingSteps';
import { derivePendingOnboardingSteps, isPlayStyle, isSportType, trackOnboardingEntry, type OnboardingStep } from '@dowhat/shared';

type OnboardingNavLinkProps = {
  className?: string;
};

export function OnboardingNavLink({ className }: OnboardingNavLinkProps) {
  const [steps, setSteps] = useState<OnboardingStep[] | null>(null);
  const onboardingHub: Route = '/onboarding';

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!active) return;
        const user = data.user;
        if (!user) {
          setSteps([]);
          return;
        }
        const [profileResult, traitsResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('primary_sport, play_style, reliability_pledge_ack_at')
            .eq('id', user.id)
            .maybeSingle<{ primary_sport: string | null; play_style: string | null; reliability_pledge_ack_at: string | null }>(),
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
        const traitCount = traitsResult.count ?? 0;
        const normalizedSport = profileResult.data?.primary_sport && isSportType(profileResult.data.primary_sport)
          ? profileResult.data.primary_sport
          : null;
        const normalizedPlayStyle = profileResult.data?.play_style && isPlayStyle(profileResult.data.play_style)
          ? profileResult.data.play_style
          : null;

        let skillLevel: string | null = null;
        if (normalizedSport) {
          const skillResult = await supabase
            .from('user_sport_profiles')
            .select('skill_level')
            .eq('user_id', user.id)
            .eq('sport', normalizedSport)
            .maybeSingle<{ skill_level: string | null }>();
          if (!active) return;
          if (skillResult.error && skillResult.error.code !== 'PGRST116') {
            throw skillResult.error;
          }
          skillLevel = skillResult.data?.skill_level ?? null;
        }

        const pendingSteps = derivePendingOnboardingSteps({
          traitCount,
          primarySport: normalizedSport,
          playStyle: normalizedPlayStyle,
          skillLevel,
          pledgeAckAt: profileResult.data?.reliability_pledge_ack_at ?? null,
        });
        setSteps(pendingSteps);
      } catch (err) {
        console.warn('[onboarding-nav] failed to load progress', err);
        if (active) setSteps([]);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  if (!steps || steps.length === 0) return null;

  const pendingCount = steps.length;
  const primaryStep = steps[0] ?? null;
  const nextHref: Route = primaryStep ? ONBOARDING_STEP_ROUTES[primaryStep] : onboardingHub;
  const nextLabel = primaryStep ? ONBOARDING_STEP_LABELS[primaryStep] : null;

  const handleClick = () => {
    trackOnboardingEntry({
      source: 'nav',
      platform: 'web',
      steps,
      pendingSteps: pendingCount,
      step: primaryStep ?? undefined,
      nextStep: nextHref,
    });
  };

  return (
    <Link
      href={nextHref}
      className={cn(
        'inline-flex items-center gap-sm rounded-full bg-brand-teal px-lg py-xxs text-xs font-semibold text-white shadow-card transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-teal focus:ring-offset-2',
        className,
      )}
      onClick={handleClick}
      aria-label={nextLabel ? `Finish onboarding. Next: ${nextLabel}` : 'Finish onboarding'}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      <span className="flex flex-col text-left leading-tight">
        <span>Finish onboarding</span>
        {nextLabel ? <span className="text-[11px] font-normal text-white/85">Next: {nextLabel}</span> : null}
      </span>
      <span className="rounded-full bg-surface/20 px-xs py-hairline text-[11px] font-semibold leading-none">{pendingCount}</span>
    </Link>
  );
}
