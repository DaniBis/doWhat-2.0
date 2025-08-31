"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";

type Row = {
  id: string;
  activity_id: string;
  status: "going" | "interested" | "declined";
};

type Session = {
  id: string; // session id
  activity_id: string; // FK
  starts_at: string;
  ends_at: string;
  price_cents: number | null;
  activities?: { name?: string | null } | null;
  venues?: { name?: string | null } | null;
};

export default function MyRsvpsPage() {
  const [rows, setRows] = useState<(Session & { rsvp: Row })[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        setErr("Please sign in to see your RSVPs.");
        setLoading(false);
        return;
      }
      const { data: rsvps, error } = await supabase
        .from("rsvps")
        .select("id,activity_id,status")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }
      const ids = (rsvps ?? []).map((r) => r.activity_id);
      if (!ids.length) {
        setRows([]);
        setLoading(false);
        return;
      }
      // Fetch upcoming sessions for those activities and pick the next one per activity
      const { data: sessions, error: e2 } = await supabase
        .from("sessions")
        .select("id, activity_id, starts_at, ends_at, price_cents, activities(name), venues(name)")
        .in("activity_id", ids)
        .order("starts_at", { ascending: true });
      if (e2) setErr(e2.message);

      const nextByActivity = new Map<string, Session>();
      for (const s of (sessions ?? []) as any[]) {
        const key = s.activity_id as string;
        if (!nextByActivity.has(key)) nextByActivity.set(key, s as Session);
      }

      const merged = (rsvps ?? [])
        .map((r) => ({ rsvp: r as Row, sess: nextByActivity.get(r.activity_id) }))
        .filter((x) => x.sess)
        .map((x) => ({ ...(x.sess as Session), rsvp: x.rsvp }));

      setRows(merged);
      setLoading(false);
    })();
  }, []);

  async function updateStatus(activity_id: string, next: Row["status"]) {
    setErr(null);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return setErr("Please sign in first.");
    const { error } = await supabase
      .from("rsvps")
      .upsert({ activity_id, user_id: uid, status: next }, { onConflict: "activity_id,user_id" });
    if (error) return setErr(error.message);
    setRows((prev) =>
      prev.map((a) =>
        a.activity_id === activity_id ? { ...a, rsvp: { ...a.rsvp, status: next } } : a
      )
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-lg font-semibold">My RSVPs</h1>
      </div>
      {loading && <p>Loading…</p>}
      {err && <p className="text-red-600">{err}</p>}
      {!loading && !err && rows.length === 0 && <p>You have no RSVPs yet.</p>}
      <ul className="space-y-3">
        {rows.map((a) => (
          <li key={a.id} className="rounded border p-4">
            <div className="font-semibold">{a.activities?.name ?? "Activity"}</div>
            <div className="text-sm text-gray-600">{a.venues?.name ?? "Venue"}</div>
            <div className="mt-2 text-sm">Status: <b>{a.rsvp.status}</b></div>
            <div className="mt-2 flex gap-2">
              <button className="rounded border px-2 py-1" onClick={() => updateStatus(a.activity_id, "going")}>Going</button>
              <button className="rounded border px-2 py-1" onClick={() => updateStatus(a.activity_id, "interested")}>Interested</button>
              <button className="rounded border px-2 py-1" onClick={() => updateStatus(a.activity_id, "declined")}>Declined</button>
              <Link href={`/sessions/${a.id}`} className="ml-auto text-brand-teal">Open</Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
