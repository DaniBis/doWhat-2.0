"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";

type Activity = { id: string; name: string };

export default function AdminActivities() {
  const [rows, setRows] = useState<Activity[]>([]);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const em = auth?.user?.email ?? null;
      setEmail(em);
      const allow = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
        .split(/[ ,]+/)
        .filter(Boolean)
        .map((s) => s.toLowerCase());
      setIsAdmin(em ? allow.includes(em.toLowerCase()) : false);

      setLoading(true);
      const { data, error } = await supabase.from("activities").select("id,name").order("name");
      if (error) setErr(error.message);
      else setRows((data ?? []) as Activity[]);
      setLoading(false);
    })();
  }, []);

  async function add() {
    try {
      setErr(null);
      const n = name.trim();
      if (!n) return;
      const { data, error } = await supabase.from("activities").insert({ name: n }).select("id,name").single();
      if (error) throw error;
      setRows((prev) => [...prev, data as Activity].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
    } catch (e: any) {
      setErr(e.message ?? "Failed to add");
    }
  }

  async function del(id: string) {
    try {
      setErr(null);
      await supabase.from("activities").delete().eq("id", id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      setErr(e.message ?? "Failed to delete");
    }
  }

  if (isAdmin === false) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-3 flex items-center gap-2">
          <Link href="/" className="text-brand-teal">&larr; Back</Link>
          <h1 className="text-lg font-semibold">Manage Activities</h1>
        </div>
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
          You don’t have access to this page.
          <div className="mt-2 text-sm text-red-600">Signed in as: {email ?? "(not signed in)"}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-lg font-semibold">Manage Activities</h1>
        <Link href="/admin/sessions" className="ml-auto text-brand-teal">Sessions</Link>
        <Link href="/admin/venues" className="text-brand-teal">Venues</Link>
      </div>
      {err && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-red-700">{err}</div>}

      <div className="mb-4 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New activity name" className="flex-1 rounded border px-3 py-2" />
        <button onClick={add} className="rounded bg-brand-teal px-3 py-2 text-white">Add</button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <ul className="divide-y rounded border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between p-3">
              <span>{r.name}</span>
              <button onClick={() => del(r.id)} className="rounded border border-red-300 px-2 py-1 text-red-700">Delete</button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
