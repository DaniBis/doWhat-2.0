"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase/browser";

type Option = { id: string; name: string };

export default function AdminNewSessionPage() {
  // Basic admin gate: allow if email appears in NEXT_PUBLIC_ADMIN_EMAILS (comma-separated)
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [activities, setActivities] = useState<Option[]>([]);
  const [venues, setVenues] = useState<Option[]>([]);

  const [activityId, setActivityId] = useState<string>("");
  const [activityName, setActivityName] = useState<string>("");

  const [venueId, setVenueId] = useState<string>("");
  const [venueName, setVenueName] = useState<string>("");
  const [venueLat, setVenueLat] = useState<string>("");
  const [venueLng, setVenueLng] = useState<string>("");

  const [price, setPrice] = useState<string>("");
  const [startsAt, setStartsAt] = useState<string>("");
  const [endsAt, setEndsAt] = useState<string>("");

  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const email = auth?.user?.email ?? null;
      setUserEmail(email);
      const allow = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
        .split(/[,\s]+/)
        .filter(Boolean)
        .map((s) => s.toLowerCase());
      setIsAdmin(email ? allow.includes(email.toLowerCase()) : false);

      const a = await supabase.from("activities").select("id,name").order("name");
      if (!a.error) setActivities((a.data ?? []) as Option[]);
      const v = await supabase.from("venues").select("id,name").order("name");
      if (!v.error) setVenues((v.data ?? []) as Option[]);
    })();
  }, []);

  const chosenActivityName = useMemo(() => {
    if (activityId) return activities.find((x) => x.id === activityId)?.name ?? "";
    return activityName;
  }, [activityId, activityName, activities]);

  const chosenVenueName = useMemo(() => {
    if (venueId) return venues.find((x) => x.id === venueId)?.name ?? "";
    return venueName;
  }, [venueId, venueName, venues]);

  async function ensureActivity(): Promise<string> {
    if (activityId) return activityId;
    const name = activityName.trim();
    if (!name) throw new Error("Enter activity name or select one.");
    const { data, error } = await supabase
      .from("activities")
      .insert({ name })
      .select("id")
      .single();
    if (error) throw error;
    return (data as any).id as string;
  }

  async function ensureVenue(): Promise<string> {
    if (venueId) return venueId;
    const name = venueName.trim();
    if (!name) throw new Error("Enter venue name or select one.");
    const lat = venueLat ? Number(venueLat) : null;
    const lng = venueLng ? Number(venueLng) : null;
    const payload: Record<string, any> = { name };
    if (!Number.isNaN(lat)) payload.lat = lat;
    if (!Number.isNaN(lng)) payload.lng = lng;
    const { data, error } = await supabase
      .from("venues")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return (data as any).id as string;
  }

  async function onCreate() {
    try {
      setErr("");
      setMsg("");
      setSubmitting(true);
      if (!isAdmin) throw new Error("You are not allowed to create sessions.");

      const actId = await ensureActivity();
      const venId = await ensureVenue();

      const cents = Math.round((Number(price) || 0) * 100);
      if (!startsAt || !endsAt) throw new Error("Start and end time are required.");
      const starts = new Date(startsAt).toISOString();
      const ends = new Date(endsAt).toISOString();
      if (isNaN(+new Date(starts)) || isNaN(+new Date(ends))) {
        throw new Error("Invalid date/time values.");
      }
      if (+new Date(ends) <= +new Date(starts)) {
        throw new Error("End time must be after start time.");
      }

      const { data, error } = await supabase
        .from("sessions")
        .insert({ activity_id: actId, venue_id: venId, price_cents: cents, starts_at: starts, ends_at: ends })
        .select("id")
        .single();
      if (error) throw error;

      setMsg("Session created. Redirecting…");
      const id = (data as any).id as string;
      // Navigate to the new session page
      window.location.href = `/sessions/${id}`;
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (isAdmin === false) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-3 flex items-center gap-2">
          <Link href="/" className="text-brand-teal">&larr; Back</Link>
          <h1 className="text-lg font-semibold">Create Session</h1>
        </div>
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
          You don’t have access to this page. Ask an admin to add your email to NEXT_PUBLIC_ADMIN_EMAILS.
          <div className="mt-2 text-sm text-red-600">Signed in as: {userEmail ?? "(not signed in)"}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-lg font-semibold">Create Session</h1>
      </div>

      {err && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-red-700">{err}</div>}
      {msg && <div className="mb-3 rounded bg-green-50 px-3 py-2 text-green-700">{msg}</div>}

      <section className="grid gap-4">
        <div className="rounded border p-4">
          <h2 className="font-semibold">Activity</h2>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">Select existing</label>
              <select value={activityId} onChange={(e) => setActivityId(e.target.value)} className="w-full rounded border px-3 py-2">
                <option value="">-- none --</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm">Or new name</label>
              <input value={activityName} onChange={(e) => setActivityName(e.target.value)} placeholder="e.g. Running" className="w-full rounded border px-3 py-2" />
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500">Chosen: {chosenActivityName || "—"}</p>
          {!activityId && !activityName && (
            <p className="mt-1 text-xs text-red-600">Select an activity or type a new one.</p>
          )}
        </div>

        <div className="rounded border p-4">
          <h2 className="font-semibold">Venue</h2>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">Select existing</label>
              <select value={venueId} onChange={(e) => setVenueId(e.target.value)} className="w-full rounded border px-3 py-2">
                <option value="">-- none --</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm">Or new name</label>
              <input value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="e.g. City Park" className="w-full rounded border px-3 py-2" />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">Latitude (optional)</label>
              <input value={venueLat} onChange={(e) => setVenueLat(e.target.value)} inputMode="decimal" placeholder="51.5074" className="w-full rounded border px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm">Longitude (optional)</label>
              <input value={venueLng} onChange={(e) => setVenueLng(e.target.value)} inputMode="decimal" placeholder="-0.1278" className="w-full rounded border px-3 py-2" />
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500">Chosen: {chosenVenueName || "—"}</p>
          {!venueId && !venueName && (
            <p className="mt-1 text-xs text-red-600">Select a venue or type a new one.</p>
          )}
        </div>

        <div className="rounded border p-4">
          <h2 className="font-semibold">Session</h2>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">Price (EUR)</label>
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="15" className="w-full rounded border px-3 py-2" />
              {price !== "" && Number(price) < 0 && (
                <p className="mt-1 text-xs text-red-600">Price cannot be negative.</p>
              )}
            </div>
            <div />
            <div>
              <label className="mb-1 block text-sm">Starts at</label>
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-full rounded border px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm">Ends at</label>
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="w-full rounded border px-3 py-2" />
              {startsAt && endsAt && +new Date(endsAt) <= +new Date(startsAt) && (
                <p className="mt-1 text-xs text-red-600">End time must be after start.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onCreate} disabled={submitting || (!activityId && !activityName) || (!venueId && !venueName) || !startsAt || !endsAt} className="rounded bg-brand-teal px-4 py-2 text-white disabled:opacity-50">
            {submitting ? "Creating…" : "Create session"}
          </button>
        </div>
      </section>
    </main>
  );
}
