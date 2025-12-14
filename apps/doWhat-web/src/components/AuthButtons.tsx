"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/browser";

const EmailAuth = dynamic(() => import("@/components/EmailAuth"), { ssr: false });

type AuthButtonsProps = {
  variant?: "panel" | "inline";
};

export default function AuthButtons({ variant = "panel" }: AuthButtonsProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const isInline = variant === "inline";

  useEffect(() => {
    let mounted = true;

    const getUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        setUser(data.user ?? null);
        setLoading(false);

        const link = document.getElementById("auth-fallback-link");
        if (link) link.style.display = data.user ? "none" : "";
      } catch (error) {
        console.error("[auth] failed to load user", error);
        if (!mounted) return;
        setUser(null);
        setLoading(false);
      }
    };

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === "SIGNED_IN") {
        setSigningIn(false);
        setShowEmail(false);
      }

      const link = document.getElementById("auth-fallback-link");
      if (link) link.style.display = session?.user ? "none" : "";
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignIn = async () => {
    try {
      setSigningIn(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("[auth] sign in error", error);
      setSigningIn(false);
    }
  };

  if (isInline) {
    if (loading) {
      return (
        <div className="text-xs font-medium text-ink-muted">Loading…</div>
      );
    }

    if (!user) {
      return (
        <button
          type="button"
          onClick={handleSignIn}
          disabled={signingIn}
          className="inline-flex items-center gap-xs rounded-full border border-brand-teal/40 px-md py-xs text-sm font-semibold text-brand-teal transition hover:bg-brand-teal/10 disabled:cursor-not-allowed disabled:border-midnight-border/60 disabled:text-ink-muted"
        >
          {signingIn ? (
            <span className="flex items-center gap-xxs">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle className="opacity-20" cx="12" cy="12" r="10" />
                <path d="M22 12a10 10 0 0 0-10-10" />
              </svg>
              Working…
            </span>
          ) : (
            <>Sign in</>
          )}
        </button>
      );
    }

    return (
      <div className="flex items-center gap-xs">
        <Link
          href="/profile"
          className="inline-flex items-center gap-xs rounded-full border border-brand-teal/30 px-md py-xs text-sm font-semibold text-brand-teal transition hover:bg-brand-teal/10"
        >
          <span className="text-base">🙂</span>
          Profile
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="inline-flex items-center rounded-full border border-midnight-border/40 px-md py-xs text-sm font-semibold text-ink-medium transition hover:bg-surface"
          >
            Sign out
          </button>
        </form>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-xs text-sm text-ink-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-teal" />
        Checking your session…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-md">
        <button
          type="button"
          onClick={handleSignIn}
          disabled={signingIn}
          className="relative flex w-full items-center justify-center gap-sm rounded-xl bg-midnight px-xl py-sm text-base font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-600"
        >
          {signingIn ? (
            <span className="flex items-center gap-sm">
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle className="opacity-20" cx="12" cy="12" r="10" />
                <path d="M22 12a10 10 0 0 0-10-10" />
              </svg>
              Signing you in…
            </span>
          ) : (
            <span className="flex items-center gap-sm">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-surface text-[18px] font-bold text-ink">G</span>
              Continue with Google
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowEmail((state) => !state)}
          className="flex w-full items-center justify-center gap-xs rounded-xl border border-midnight-border/40 px-xl py-sm text-sm font-medium text-ink-medium transition hover:border-midnight-border/60 hover:bg-surface-alt"
          aria-expanded={showEmail}
        >
          {showEmail ? "Hide email sign-in" : "Use email instead"}
        </button>

        {showEmail && (
          <div className="rounded-2xl border border-midnight-border/30 bg-surface-alt/70 p-md">
            <EmailAuth onDone={() => setShowEmail(false)} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-sm rounded-2xl border border-brand-teal/25 bg-brand-teal/5 px-lg py-md text-sm text-brand-dark">
      <div className="flex flex-col">
        <span className="text-xs uppercase tracking-wide text-brand-teal">Signed in</span>
        <span className="font-semibold">{user.email ?? "Your account"}</span>
      </div>
      <div className="flex items-center gap-xs">
        <Link
          href="/profile"
          className="rounded-full border border-brand-teal/30 px-md py-xs text-xs font-semibold uppercase tracking-wide text-brand-teal transition hover:bg-brand-teal/10"
        >
          Go to profile
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-full border border-brand-teal/20 px-sm py-xs text-xs font-semibold uppercase tracking-wide text-brand-teal transition hover:bg-surface"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
