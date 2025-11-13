"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AdminNav from "@/components/AdminNav";
import { supabase } from "@/lib/supabase/browser";

type Venue = { id: string; name: string; lat: number | null; lng: number | null };

export default function AdminVenues() {
  const [rows, setRows] = useState<Venue[]>([]);
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
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
      const { data, error } = await supabase.from("venues").select("id,name,lat,lng").order("name");
      if (error) setErr(error.message);
      else setRows((data ?? []) as Venue[]);
      setLoading(false);
    })();
  }, []);

  async function add() {
    try {
      setErr(null);
      setMsg(null);
      const n = name.trim();
      if (!n) return;
      const payload: any = { name: n };
      const la = parseFloat(lat); const ln = parseFloat(lng);
      if (!Number.isNaN(la)) payload.lat = la;
      if (!Number.isNaN(ln)) payload.lng = ln;
      const { data, error } = await supabase.from("venues").insert(payload).select("id,name,lat,lng").single();
      if (error) throw error;
      setRows((prev) => [...prev, data as Venue].sort((a, b) => a.name.localeCompare(b.name)));
      setName(""); setLat(""); setLng("");
      setMsg('Added.');
    } catch (e: any) { setErr(e.message ?? "Failed to add"); }
  }

  async function del(id: string) {
    try { setErr(null); setMsg(null); await supabase.from("venues").delete().eq("id", id); setRows((prev) => prev.filter((r) => r.id !== id)); setMsg('Deleted.'); }
    catch (e: any) { setErr(e.message ?? "Failed to delete"); }
  }

  if (isAdmin === false) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-3 flex items-center gap-2">
          <Link href="/" className="text-brand-teal">&larr; Back</Link>
          <h1 className="text-lg font-semibold">Manage Venues</h1>
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
        <h1 className="text-lg font-semibold">Manage Venues</h1>
      </div>
      <AdminNav current="/admin/venues" />
      {err && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-red-700">{err}</div>}
      {msg && <div className="mb-3 rounded bg-green-50 px-3 py-2 text-green-700">{msg}</div>}

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New venue name" className="rounded border px-3 py-2" />
        <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="lat" inputMode="decimal" className="rounded border px-3 py-2" />
        <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="lng" inputMode="decimal" className="rounded border px-3 py-2" />
        <button onClick={add} className="rounded bg-brand-teal px-3 py-2 text-white">Add</button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <ul className="divide-y rounded border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between p-3">
              <span>{r.name}{r.lat != null && r.lng != null ? ` (${r.lat}, ${r.lng})` : ""}</span>
              <button onClick={() => del(r.id)} className="rounded border border-red-300 px-2 py-1 text-red-700">Delete</button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
