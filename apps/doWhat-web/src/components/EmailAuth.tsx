"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/browser";

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
    } catch (e: any) {
      setErr(e?.message || "Auth error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex gap-2">
        <button
          className={`rounded px-3 py-1 text-sm ${mode === "signin" ? "bg-emerald-600 text-white" : "border border-gray-300 text-gray-700"}`}
          onClick={() => setMode("signin")}
          type="button"
        >
          Email sign in
        </button>
        <button
          className={`rounded px-3 py-1 text-sm ${mode === "signup" ? "bg-emerald-600 text-white" : "border border-gray-300 text-gray-700"}`}
          onClick={() => setMode("signup")}
          type="button"
        >
          Create account
        </button>
        <button
          className={`rounded px-3 py-1 text-sm ${mode === "magic" ? "bg-emerald-600 text-white" : "border border-gray-300 text-gray-700"}`}
          onClick={() => setMode("magic")}
          type="button"
        >
          Magic link
        </button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            placeholder="you@example.com"
          />
        </div>
        {mode !== "magic" && (
          <div>
            <label className="block text-xs text-gray-600 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="••••••••"
            />
          </div>
        )}

        {err && <div className="rounded bg-red-50 p-2 text-sm text-red-700 border border-red-200">{err}</div>}
        {msg && <div className="rounded bg-emerald-50 p-2 text-sm text-emerald-700 border border-emerald-200">{msg}</div>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-emerald-600 px-3 py-2 text-white disabled:opacity-50"
        >
          {busy ? "Working…" : mode === "signup" ? "Create account" : mode === "magic" ? "Send magic link" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

