"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";

type Row = {
  id: string;
  activity_id: string;
  starts_at: string;
  ends_at: string;
  price_cents: number | null;
  activities?: { name?: string | null } | null;
  venues?: { name?: string | null } | null;
};

export default function AdminSessions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, Partial<Row>>>({});

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
      const { data, error } = await supabase
        .from("sessions")
        .select("id, activity_id, starts_at, ends_at, price_cents, activities(name), venues(name)")
        .order("starts_at");
      if (error) setErr(error.message);
      else setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
  }, []);

  async function save(id: string) {
    try {
      setErr(null);
      const patch = editing[id];
      if (!patch) return;
      const payload: any = {};
      if (patch.starts_at) payload.starts_at = new Date(patch.starts_at).toISOString();
      if (patch.ends_at) payload.ends_at = new Date(patch.ends_at).toISOString();
      if (patch.price_cents != null) payload.price_cents = patch.price_cents;
      const { error } = await supabase.from("sessions").update(payload).eq("id", id);
      if (error) throw error;
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } as Row : r)));
      setEditing((e) => ({ ...e, [id]: {} }));
    } catch (e: any) {
      setErr(e.message ?? "Failed to save");
    }
  }

  async function del(id: string) {
    try {
      setErr(null);
      await supabase.from("sessions").delete().eq("id", id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      setErr(e.message ?? "Failed to delete");
    }
  }

  if (isAdmin === false) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-3 flex items-center gap-2">
          <Link href="/" className="text-brand-teal">&larr; Back</Link>
          <h1 className="text-lg font-semibold">Manage Sessions</h1>
        </div>
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
          You don’t have access to this page.
          <div className="mt-2 text-sm text-red-600">Signed in as: {email ?? "(not signed in)"}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-lg font-semibold">Manage Sessions</h1>
      </div>
      {err && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-red-700">{err}</div>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600">
              <th className="p-2">Activity</th>
              <th className="p-2">Venue</th>
              <th className="p-2">Starts</th>
              <th className="p-2">Ends</th>
              <th className="p-2">Price</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const e = editing[r.id] || {};
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.activities?.name ?? "Activity"}</td>
                  <td className="p-2">{r.venues?.name ?? "Venue"}</td>
                  <td className="p-2">
                    <input type="datetime-local" value={(e.starts_at as any) ?? r.starts_at?.slice(0,16)} onChange={(ev) => setEditing((x) => ({ ...x, [r.id]: { ...(x[r.id]||{}), starts_at: ev.target.value } }))} className="rounded border px-2 py-1" />
                  </td>
                  <td className="p-2">
                    <input type="datetime-local" value={(e.ends_at as any) ?? r.ends_at?.slice(0,16)} onChange={(ev) => setEditing((x) => ({ ...x, [r.id]: { ...(x[r.id]||{}), ends_at: ev.target.value } }))} className="rounded border px-2 py-1" />
                  </td>
                  <td className="p-2">
                    <input value={String((e.price_cents ?? r.price_cents ?? 0) / 100)} onChange={(ev) => setEditing((x) => ({ ...x, [r.id]: { ...(x[r.id]||{}), price_cents: Math.round((Number(ev.target.value)||0)*100) } }))} className="w-24 rounded border px-2 py-1" />
                  </td>
                  <td className="p-2">
                    <button onClick={() => save(r.id)} className="mr-2 rounded border px-2 py-1">Save</button>
                    <button onClick={() => del(r.id)} className="rounded border border-red-300 px-2 py-1 text-red-700">Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
