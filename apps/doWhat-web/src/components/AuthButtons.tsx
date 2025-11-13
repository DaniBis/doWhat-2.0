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
        <div className="text-xs font-medium text-slate-500">Loading…</div>
      );
    }

    if (!user) {
      return (
        <button
          type="button"
          onClick={handleSignIn}
          disabled={signingIn}
          className="inline-flex items-center gap-2 rounded-full border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
        >
          {signingIn ? (
            <span className="flex items-center gap-1">
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
      <div className="flex items-center gap-2">
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 rounded-full border border-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-100"
        >
          <span className="text-base">🙂</span>
          Profile
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white"
          >
            Sign out
          </button>
        </form>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        Checking your session…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={handleSignIn}
          disabled={signingIn}
          className="relative flex w-full items-center justify-center gap-3 rounded-xl bg-slate-900 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-600"
        >
          {signingIn ? (
            <span className="flex items-center gap-3">
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle className="opacity-20" cx="12" cy="12" r="10" />
                <path d="M22 12a10 10 0 0 0-10-10" />
              </svg>
              Signing you in…
            </span>
          ) : (
            <span className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[18px] font-bold text-slate-900">G</span>
              Continue with Google
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowEmail((state) => !state)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-6 py-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          aria-expanded={showEmail}
        >
          {showEmail ? "Hide email sign-in" : "Use email instead"}
        </button>

        {showEmail && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <EmailAuth onDone={() => setShowEmail(false)} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm text-emerald-900">
      <div className="flex flex-col">
        <span className="text-xs uppercase tracking-wide text-emerald-500">Signed in</span>
        <span className="font-semibold">{user.email ?? "Your account"}</span>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/profile"
          className="rounded-full border border-emerald-400 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-600 transition hover:bg-emerald-100"
        >
          Go to profile
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-full border border-emerald-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-500 transition hover:bg-white"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
