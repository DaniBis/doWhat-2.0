"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/browser";

type Status = "going" | "interested" | "declined";

type Session = {
  id: string; // session id
  activity_id: string; // FK
  starts_at: string | null;
  ends_at: string | null;
  price_cents: number | null;
  activities?: { name?: string | null } | null;
  venues?: { name?: string | null } | null;
};

type SessionWithStatus = Session & { status: Status };

type SessionAttendeeRow = {
  session_id: string;
  status: Status;
  sessions?: Session | Session[] | null;
};

function resolveSession(raw?: Session | Session[] | null): Session | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return raw[0] ?? null;
  }
  return raw;
}

export default function MyAttendancePage() {
  const [rows, setRows] = useState<SessionWithStatus[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        setErr("Please sign in to see your attendance history.");
        setLoading(false);
        return;
      }
      const { data: attendeeRows, error } = await supabase
        .from("session_attendees")
        .select(
          "session_id,status, sessions(id, activity_id, starts_at, ends_at, price_cents, activities(name), venues(name))"
        )
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (error) {
        setErr(error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const typedRows = (attendeeRows ?? []) as SessionAttendeeRow[];
      const normalized = typedRows
        .map((row) => {
          const session = resolveSession(row.sessions);
          if (!session) return null;
          return { ...session, status: row.status } as SessionWithStatus;
        })
        .filter((value): value is SessionWithStatus => value !== null);

      setRows(normalized);
      setLoading(false);
    })();
  }, []);

  async function updateStatus(sessionId: string, next: Status) {
    setErr(null);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return setErr("Please sign in first.");
    const { error } = await supabase
      .from("session_attendees")
      .upsert({ session_id: sessionId, user_id: uid, status: next }, { onConflict: "session_id,user_id" });
    if (error) return setErr(error.message);
    setRows((prev) =>
      prev.map((a) =>
        a.id === sessionId ? { ...a, status: next } : a
      )
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-lg font-semibold">My Attendance</h1>
      </div>
      {loading && <p>Loading…</p>}
      {err && <p className="text-red-600">{err}</p>}
      {!loading && !err && rows.length === 0 && <p>You have no attendance history yet.</p>}
      <ul className="space-y-3">
        {rows.map((session) => (
          <li key={session.id} className="rounded border p-4">
            <div className="font-semibold">{session.activities?.name ?? "Activity"}</div>
            <div className="text-sm text-gray-600">{session.venues?.name ?? "Venue"}</div>
            <div className="mt-1 text-xs text-gray-500">
              Starts: {session.starts_at ? new Date(session.starts_at).toLocaleString() : "Schedule tbd"}
            </div>
            <div className="mt-2 text-sm">Status: <b>{session.status}</b></div>
            <div className="mt-2 flex gap-2">
              <button className="rounded border px-2 py-1" onClick={() => updateStatus(session.id, "going")}>
                Going
              </button>
              <button className="rounded border px-2 py-1" onClick={() => updateStatus(session.id, "interested")}>
                Interested
              </button>
              <Link
                href={{ pathname: `/sessions/${session.id}` }}
                className="ml-auto text-brand-teal"
              >
                Open
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
