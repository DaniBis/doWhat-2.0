"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

type Mode = "signin" | "signup" | "magic";

type EmailAuthProps = {
  onDone?: () => void;
  callbackUrl?: string | null;
};

export default function EmailAuth({ onDone, callbackUrl }: EmailAuthProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const resolveCallbackUrl = () => {
    if (callbackUrl) return callbackUrl;
    if (typeof window === "undefined") return null;
    return `${window.location.origin}/auth/callback`;
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null); setBusy(true);
    try {
      const targetCallback = resolveCallbackUrl();
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: targetCallback ? { emailRedirectTo: targetCallback } : undefined,
        });
        if (error) throw error;
        setMsg("Magic link sent. Check your email.");
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMsg("Signed in.");
        onDone?.();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: targetCallback ? { emailRedirectTo: targetCallback } : undefined,
        });
        if (error) throw error;
        if (data.user && data.session) {
          setMsg("Account created and signed in.");
          onDone?.();
        } else {
          setMsg("Check your email to confirm your account.");
        }
      }
    } catch (error: unknown) {
      setErr(getErrorMessage(error) || "Auth error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-midnight-border/40 bg-surface/90 p-lg shadow-sm">
      <div className="mb-md flex flex-wrap gap-xs">
        <button
          className={`rounded-full px-md py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
            mode === "signin"
              ? "bg-brand-teal text-white shadow-sm"
              : "border border-midnight-border/40 bg-surface text-ink-medium hover:border-midnight-border/60"
          }`}
          onClick={() => setMode("signin")}
          type="button"
        >
          Email sign in
        </button>
        <button
          className={`rounded-full px-md py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
            mode === "signup"
              ? "bg-brand-teal text-white shadow-sm"
              : "border border-midnight-border/40 bg-surface text-ink-medium hover:border-midnight-border/60"
          }`}
          onClick={() => setMode("signup")}
          type="button"
        >
          Create account
        </button>
        <button
          className={`rounded-full px-md py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
            mode === "magic"
              ? "bg-brand-teal text-white shadow-sm"
              : "border border-midnight-border/40 bg-surface text-ink-medium hover:border-midnight-border/60"
          }`}
          onClick={() => setMode("magic")}
          type="button"
        >
          Magic link
        </button>
      </div>

      <form onSubmit={submit} className="space-y-md">
        <div className="space-y-xxs">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-midnight-border/40 bg-surface px-md py-xs text-sm text-ink-strong outline-none ring-brand-teal/30 transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/60"
            placeholder="you@example.com"
          />
        </div>
        {mode !== "magic" && (
          <div className="space-y-xxs">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-midnight-border/40 bg-surface px-md py-xs text-sm text-ink-strong outline-none ring-brand-teal/30 transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/60"
              placeholder="••••••••"
            />
          </div>
        )}

        {err && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-sm py-xs text-sm text-red-700">
            {err}
          </div>
        )}
        {msg && (
          <div className="rounded-xl border border-brand-teal/25 bg-brand-teal/10 px-sm py-xs text-sm text-brand-dark">
            {msg}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-brand-teal px-md py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-brand-teal/60"
        >
          {busy ? "Working…" : mode === "signup" ? "Create account" : mode === "magic" ? "Send magic link" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
