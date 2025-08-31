"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/browser";

export default function ProfilePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      const em = auth?.user?.email ?? null;
      setEmail(em);
      if (!uid) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", uid)
        .maybeSingle();
      if (error) return; // ignore if not found
      setFullName((data?.full_name as string) || "");
      setAvatarUrl((data?.avatar_url as string) || "");
    })();
  }, []);

  async function save() {
    try {
      setErr("");
      setMsg("");
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("Please sign in first.");
      const upsert = {
        id: uid,
        full_name: fullName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("profiles").upsert(upsert, { onConflict: "id" });
      if (error) throw error;
      setMsg("Saved.");
    } catch (e: any) {
      setErr(e.message ?? "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-lg font-semibold">My Profile</h1>
      </div>

      {!email && (
        <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          You are not signed in. Please sign in first.
        </div>
      )}

      {err && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-red-700">{err}</div>}
      {msg && <div className="mb-3 rounded bg-green-50 px-3 py-2 text-green-700">{msg}</div>}

      <div className="grid gap-3">
        <div>
          <label className="mb-1 block text-sm text-gray-700">Email</label>
          <input value={email ?? ""} readOnly className="w-full cursor-not-allowed rounded border bg-gray-50 px-3 py-2" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-700">Full Name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-700">Avatar URL</label>
          <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} className="w-full rounded border px-3 py-2" />
        </div>
        <div>
          <button onClick={save} disabled={loading} className="rounded bg-brand-teal px-4 py-2 text-white disabled:opacity-50">
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </main>
  );
}

