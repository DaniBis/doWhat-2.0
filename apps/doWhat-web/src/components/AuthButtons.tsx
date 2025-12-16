"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/browser";

const EmailAuth = dynamic(() => import("@/components/EmailAuth"), { ssr: false });

type AuthIntent = "signin" | "signup";

type AuthButtonsProps = {
  variant?: "panel" | "inline";
  intent?: AuthIntent;
  redirectTo?: string | null;
};

const SESSION_CHECK_TIMEOUT_MS = 5000;

const hideFallbackLink = () => {
  const link = document.getElementById("auth-fallback-link");
  if (link) {
    link.style.display = "none";
    link.setAttribute("aria-hidden", "true");
  }
};

export default function AuthButtons({ variant = "panel", intent = "signin", redirectTo = null }: AuthButtonsProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const normalizedIntent: AuthIntent = intent === "signup" ? "signup" : "signin";

  const isInline = variant === "inline";
  const isSignupFlow = normalizedIntent === "signup";
  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") return null;
    const url = new URL("/auth/callback", window.location.origin);
    if (redirectTo) url.searchParams.set("next", redirectTo);
    return url.toString();
  }, [redirectTo]);

  useEffect(() => {
    let mounted = true;
    let sessionCheckTimeout: ReturnType<typeof setTimeout> | null = null;
    hideFallbackLink();

    const startSessionTimeout = () => {
      if (sessionCheckTimeout != null) return;
      sessionCheckTimeout = window.setTimeout(() => {
        if (!mounted) return;
        console.warn("[auth] session check exceeded timeout; showing buttons");
        setLoading(false);
      }, SESSION_CHECK_TIMEOUT_MS);
    };

    const clearSessionTimeout = () => {
      if (sessionCheckTimeout != null) {
        clearTimeout(sessionCheckTimeout);
        sessionCheckTimeout = null;
      }
    };

    const getUser = async () => {
      try {
        startSessionTimeout();
        const { data } = await supabase.auth.getUser();
        clearSessionTimeout();
        if (!mounted) return;
        setUser(data.user ?? null);
        setLoading(false);
        hideFallbackLink();
      } catch (error) {
        console.error("[auth] failed to load user", error);
        clearSessionTimeout();
        if (!mounted) return;
        setUser(null);
        setLoading(false);
      }
    };

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      clearSessionTimeout();
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === "SIGNED_IN") {
        setSigningIn(false);
        setShowEmail(false);
      }
      hideFallbackLink();
    });

    return () => {
      mounted = false;
      clearSessionTimeout();
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!user) {
      setMenuOpen(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void router.prefetch("/profile");
    }
  }, [router, user]);

  const handleSignIn = async (targetIntent: AuthIntent = normalizedIntent) => {
    try {
      setSigningIn(true);
      const resolvedCallback = callbackUrl ?? (typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: resolvedCallback,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("[auth] sign in error", error);
      setSigningIn(false);
      if (typeof window !== "undefined") {
        const params = new URLSearchParams({ intent: targetIntent });
        if (redirectTo) params.set("redirect", redirectTo);
        window.location.assign(`/auth?${params.toString()}`);
      }
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSignIn("signin")}
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
          <Link
            href="/auth?intent=signup"
            className="inline-flex items-center gap-xs rounded-full border border-slate-300 px-md py-xs text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            Sign up
          </Link>
        </div>
      );
    }
    const initial = (user.email?.[0] ?? user.user_metadata?.full_name?.[0] ?? "?").toUpperCase();
    const label = user.email ?? user.user_metadata?.full_name ?? "Your account";

    return (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((state) => !state)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand-teal/40 bg-white text-sm font-semibold text-brand-teal transition hover:bg-brand-teal/10"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={label}
        >
          <span className="sr-only">Open account menu</span>
          {initial}
        </button>
        {menuOpen && (
          <div className="absolute right-0 z-20 mt-2 w-44 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                router.push("/profile");
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              View profile
            </button>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-100"
              >
                Sign out
              </button>
            </form>
          </div>
        )}
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
          onClick={() => handleSignIn(normalizedIntent)}
          disabled={signingIn}
          className="relative flex w-full items-center justify-center gap-sm rounded-xl bg-midnight px-xl py-sm text-base font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-600"
        >
          {signingIn ? (
            <span className="flex items-center gap-sm">
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle className="opacity-20" cx="12" cy="12" r="10" />
                <path d="M22 12a10 10 0 0 0-10-10" />
              </svg>
              {isSignupFlow ? "Creating account…" : "Signing you in…"}
            </span>
          ) : (
            <span className="flex items-center gap-sm">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-surface text-[18px] font-bold text-ink">G</span>
              {isSignupFlow ? "Create account" : "Continue with Google"}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowEmail((state) => !state)}
          className="flex w-full items-center justify-center gap-xs rounded-xl border border-midnight-border/40 px-xl py-sm text-sm font-medium text-ink-medium transition hover:border-midnight-border/60 hover:bg-surface-alt"
          aria-expanded={showEmail}
        >
          {showEmail ? "Hide email" : "Use email instead"}
        </button>

        {showEmail && (
          <div className="rounded-2xl border border-midnight-border/30 bg-surface-alt/70 p-md">
            <EmailAuth onDone={() => setShowEmail(false)} callbackUrl={callbackUrl ?? undefined} />
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
