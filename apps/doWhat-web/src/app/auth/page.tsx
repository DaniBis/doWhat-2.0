"use client";
import type { Route } from 'next';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import AuthButtons from '@/components/AuthButtons';

export default function AuthPage() {
  const searchParams = useSearchParams();
  const intentParam = searchParams.get('intent') === 'signup' ? 'signup' : 'signin';
  const redirectCandidates = ['redirect', 'next', 'redirect_to', 'redirectTo'] as const;
  const rawRedirect = redirectCandidates
    .map((key) => searchParams.get(key))
    .find((value): value is string => typeof value === 'string' && value.length > 0) ?? null;
  const redirectTo = rawRedirect && rawRedirect.startsWith('/') ? rawRedirect : null;
  const isSignup = intentParam === 'signup';
  const eyebrow = isSignup ? 'Start exploring' : 'Welcome back';
  const heading = isSignup ? 'Create your doWhat account' : 'Sign in to doWhat';
  const subheading = isSignup
    ? 'Set up your account to find local activities, share discoveries, and team up with people nearby.'
    : 'Find experiences nearby, connect with people you vibe with, and plan your next activity together.';
  const buildIntentLink = (intent: 'signin' | 'signup'): Route => {
    const params = new URLSearchParams({ intent });
    if (redirectTo) params.set('redirect', redirectTo);
    return `/auth?${params.toString()}` as Route;
  };
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50 to-slate-100 px-4 py-16">
      <div className="absolute inset-0 -z-10">
        <div className="pointer-events-none absolute left-1/2 top-12 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-200 opacity-40 blur-3xl" />
        <div className="pointer-events-none absolute bottom-12 right-6 h-80 w-80 rounded-full bg-emerald-200 opacity-30 blur-3xl" />
      </div>

      <div className="w-full max-w-xl rounded-3xl border border-white/70 bg-white/80 p-10 shadow-xl backdrop-blur">
        <div className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-500">{eyebrow}</p>
          <h1 className="text-3xl font-extrabold text-slate-900">{heading}</h1>
          <p className="text-base text-slate-600">{subheading}</p>
        </div>

        <div className="mt-10 rounded-2xl border border-slate-100 bg-white p-8 shadow-lg shadow-indigo-100">
          <div className="pb-6">
            <p className="text-center text-sm font-semibold text-slate-800">
              {isSignup ? 'Choose how you would like to sign up' : 'Continue to your account'}
            </p>
          </div>
          <AuthButtons variant="panel" intent={intentParam} redirectTo={redirectTo} />
        </div>

        <div className="mt-8 text-center text-sm">
          <div className="space-y-2">
            <Link href="/" className="font-medium text-indigo-600 hover:text-indigo-500">
              ← Back to home
            </Link>
            <p className="text-slate-500">
              {isSignup ? (
                <>
                  Already have an account?{' '}
                  <Link href={buildIntentLink('signin')} className="font-semibold text-indigo-600 hover:text-indigo-500">
                    Sign in
                  </Link>
                </>
              ) : (
                <>
                  New to doWhat?{' '}
                  <Link href={buildIntentLink('signup')} className="font-semibold text-indigo-600 hover:text-indigo-500">
                    Create an account
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
