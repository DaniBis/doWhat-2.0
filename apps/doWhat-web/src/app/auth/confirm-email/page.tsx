"use client";

import type { Route } from 'next';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase/browser';
import { buildAuthRedirectHref, isEmailConfirmed, sanitizeRedirectPath } from '@/lib/access/coreAccess';
import { buildAuthCallbackUrl } from '@/lib/authRedirects';

type ResendState = 'idle' | 'sending' | 'sent' | 'error';

export default function ConfirmEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = useMemo(() => {
    const candidate =
      searchParams.get('redirect')
      ?? searchParams.get('next')
      ?? '/';
    return sanitizeRedirectPath(candidate, '/');
  }, [searchParams]);
  const [email, setEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<ResendState>('idle');
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user ?? null;
    if (!user) {
      router.replace(buildAuthRedirectHref(redirectTarget) as Route);
      return;
    }
    setEmail(user.email ?? null);
    if (isEmailConfirmed(user)) {
      router.replace(redirectTarget as Route);
    }
  }, [redirectTarget, router]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const handleResend = useCallback(async () => {
    setStatus('sending');
    setError(null);
    try {
      const { data } = await supabase.auth.getUser();
      const user = data.user ?? null;
      if (!user?.email) {
        router.replace(buildAuthRedirectHref(redirectTarget) as Route);
        return;
      }

      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
        options: { emailRedirectTo: buildAuthCallbackUrl(window.location.origin, redirectTarget) },
      });
      if (resendError) {
        throw resendError;
      }
      setStatus('sent');
    } catch (resendError) {
      setStatus('error');
      setError(resendError instanceof Error ? resendError.message : 'Unable to resend confirmation email.');
    }
  }, [redirectTarget, router]);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg items-center px-4 py-16">
      <section className="glass-panel w-full p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-500">Account security</p>
        <h1 className="mt-3 text-3xl font-semibold text-ink-strong">Confirm your email</h1>
        <p className="mt-3 text-sm text-ink-medium">
          Check your inbox and click the confirmation link before using doWhat.
          {email ? ` We sent it to ${email}.` : ''}
        </p>
        <ol className="mt-6 space-y-2 text-sm text-ink-medium">
          <li>1. Open the latest email from doWhat.</li>
          <li>2. Click the confirmation link.</li>
          <li>3. Return here and continue.</li>
        </ol>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleResend}
            disabled={status === 'sending'}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-70"
          >
            {status === 'sending' ? 'Sending…' : 'Resend confirmation email'}
          </button>
          <button
            type="button"
            onClick={() => void refreshSession()}
            className="btn-outline"
          >
            I have confirmed, continue
          </button>
          <Link href={buildAuthRedirectHref(redirectTarget) as Route} className="btn-outline">
            Switch account
          </Link>
        </div>
        {status === 'sent' ? (
          <p className="mt-4 text-sm text-emerald-700">Confirmation email sent. Check your inbox and spam folder.</p>
        ) : null}
        {status === 'error' && error ? (
          <p className="mt-4 text-sm text-rose-700">{error}</p>
        ) : null}
      </section>
    </main>
  );
}
