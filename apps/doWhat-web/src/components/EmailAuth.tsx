"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

type Mode = "signin" | "signup" | "magic";

export default function EmailAuth({ onDone }: { onDone?: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null); setBusy(true);
    try {
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
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
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
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
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
            mode === "signin"
              ? "bg-emerald-600 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
          onClick={() => setMode("signin")}
          type="button"
        >
          Email sign in
        </button>
        <button
          className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
            mode === "signup"
              ? "bg-emerald-600 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
          onClick={() => setMode("signup")}
          type="button"
        >
          Create account
        </button>
        <button
          className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
            mode === "magic"
              ? "bg-emerald-600 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
          onClick={() => setMode("magic")}
          type="button"
        >
          Magic link
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 outline-none ring-emerald-200 transition focus:border-emerald-300 focus:ring-2"
            placeholder="you@example.com"
          />
        </div>
        {mode !== "magic" && (
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 outline-none ring-emerald-200 transition focus:border-emerald-300 focus:ring-2"
              placeholder="••••••••"
            />
          </div>
        )}

        {err && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}
        {msg && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {msg}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-400"
        >
          {busy ? "Working…" : mode === "signup" ? "Create account" : mode === "magic" ? "Send magic link" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
