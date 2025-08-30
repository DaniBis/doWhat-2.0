// src/app/nearby/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { format } from "date-fns";

// Client-side Supabase instance

/** ----------------------
 * Types
 * ---------------------*/
type SessionRow = {
  session_id: string;
  starts_at: string;
  ends_at: string;
  price_cents: number | null;
  activity_id: string;
  activity_name: string;
  venue_id: string;
  venue_name: string;
  venue_lat: number | null;
  venue_lng: number | null;
  distance_km: number;
};

type Activity = { id: string; name: string };

/** ----------------------
 * Small UI bits (kept local to this file)
 * ---------------------*/
function Chip({
  selected,
  children,
  onClick,
}: {
  selected?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "whitespace-nowrap rounded-full px-3 py-1 text-sm border",
        selected
          ? "bg-brand-teal/10 border-brand-teal text-brand-teal"
          : "bg-white border-gray-300 text-gray-700",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border p-4 animate-pulse">
      <div className="h-4 w-24 rounded bg-gray-200" />
      <div className="mt-2 h-4 w-48 rounded bg-gray-200" />
      <div className="mt-2 h-3 w-40 rounded bg-gray-200" />
      <div className="mt-2 h-3 w-24 rounded bg-gray-200" />
    </div>
  );
}

function fmtRange(starts: string, ends: string) {
  const s = new Date(starts);
  const e = new Date(ends);
  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();

  const left = format(s, "EEE, d MMM, HH:mm");
  const right = sameDay ? format(e, "HH:mm") : format(e, "EEE, d MMM, HH:mm");
  return `${left} – ${right}`;
}

/** ----------------------
 * Page
 * ---------------------*/
export default function NearbyPage() {
  // filters
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [km, setKm] = useState<string>("25");
  const [day, setDay] = useState<string>(""); // yyyy-MM-dd from <input type="date">

  // activities
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]); // chosen by chip UI
  const [fallbackMulti, setFallbackMulti] = useState<string[]>([]); // accessibility multi-select

  // results
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // mobile-first: pull geolocation ASAP; restore last search
  useEffect(() => {
    try {
      const cache = JSON.parse(
        localStorage.getItem("nearby:last") || "{}"
      ) as Partial<{
        lat: string;
        lng: string;
        km: string;
        day: string;
        act: string[];
      }>;
      if (cache.lat) setLat(cache.lat);
      if (cache.lng) setLng(cache.lng);
      if (cache.km) setKm(cache.km);
      if (cache.day) setDay(cache.day);
      if (cache.act) {
        setSelectedIds(cache.act);
        setFallbackMulti(cache.act);
      }
    } catch {}

    // preload activities for chips
    (async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("id,name")
        .order("name");
      if (!error && data) setAllActivities(data as Activity[]);
    })();

    if ("geolocation" in navigator && (!lat || !lng)) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setLat(p.coords.latitude.toFixed(6));
          setLng(p.coords.longitude.toFixed(6));
        },
        () => {} // ignore
      );
    }
  }, []);

  // keep fallback multi and chips in sync (two entry points)
  useEffect(() => {
    setFallbackMulti(selectedIds);
  }, [selectedIds]);
  useEffect(() => {
    setSelectedIds(fallbackMulti);
  }, [fallbackMulti]);

  const selectedCount = selectedIds.length;

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const selectAll = () => setSelectedIds(allActivities.map((a) => a.id));
  const clearAll = () => setSelectedIds([]);

  const chosenActivities = useMemo(
    () => (selectedIds.length ? selectedIds : null),
    [selectedIds]
  );

  async function search() {
    setErr(null);
    setRows(null);

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const kmNum = parseFloat(km);

    if ([latNum, lngNum, kmNum].some((n) => Number.isNaN(n))) {
      setErr("Please enter valid numbers for lat, lng and km.");
      return;
    }

    const dayStr = day ? new Date(day).toISOString().slice(0, 10) : null;

    setLoading(true);
    const { data, error } = await supabase
      .rpc("sessions_nearby", {
        lat: latNum,
        lng: lngNum,
        p_km: kmNum,
        activities: chosenActivities,
        day: dayStr,
      })
      .returns<SessionRow[]>();

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    // tie-breaker sort (distance, then start time)
    const sorted = (data ?? []).sort(
      (a, b) =>
        a.distance_km - b.distance_km ||
        +new Date(a.starts_at) - +new Date(b.starts_at)
    );

    setRows(sorted);
    setLoading(false);

    // cache for convenience
    try {
      localStorage.setItem(
        "nearby:last",
        JSON.stringify({
          lat,
          lng,
          km,
          day,
          act: selectedIds,
        })
      );
    } catch {}
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-3 sm:max-w-2xl">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <Link href="/" className="text-brand-teal">
          &larr; Back
        </Link>
        <h1 className="ml-1 text-lg font-semibold">Activities near you</h1>
      </div>

      {/* Activities (chips) */}
      <section aria-labelledby="activities" className="mt-3">
        <div className="mb-2 flex items-center justify-between">
          <span id="activities" className="text-sm font-medium text-gray-700">
            Activities
          </span>
          <span className="text-xs text-gray-500">
            {selectedCount}/{allActivities.length} selected
          </span>
        </div>

        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          >
            Clear
          </button>
        </div>

        <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
          <div className="flex flex-wrap gap-2">
            {allActivities.map((a) => (
              <Chip
                key={a.id}
                selected={selectedIds.includes(a.id)}
                onClick={() => toggle(a.id)}
              >
                {a.name}
              </Chip>
            ))}
          </div>
        </div>

        {/* Accessibility fallback (kept visible but below) */}
        <div className="mt-3">
          <label className="mb-1 block text-xs text-gray-500">
            Activities (fallback select)
          </label>
          <select
            multiple
            value={fallbackMulti}
            onChange={(e) =>
              setFallbackMulti(
                Array.from(e.target.selectedOptions, (o) => o.value)
              )
            }
            className="h-28 w-full rounded border px-2 py-1"
          >
            {allActivities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-gray-500">
            Hold Ctrl/Cmd to select multiple.
          </p>
        </div>
      </section>

      {/* Filters */}
      <section className="mt-5 grid grid-cols-1 gap-3">
        <div className="grid grid-cols-[1fr_1fr] gap-3">
          <div>
            <label className="mb-1 block text-sm text-gray-700">Latitude</label>
            <input
              inputMode="decimal"
              placeholder="51.5074"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="w-full rounded border px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-700">
              Longitude
            </label>
            <input
              inputMode="decimal"
              placeholder="-0.1278"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="w-full rounded border px-3 py-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <div>
            <label className="mb-1 block text-sm text-gray-700">
              Radius (km)
            </label>
            <input
              inputMode="numeric"
              placeholder="25"
              value={km}
              onChange={(e) => setKm(e.target.value)}
              className="w-full rounded border px-3 py-2"
            />
          </div>

          <button
            type="button"
            onClick={() =>
              navigator.geolocation.getCurrentPosition(
                (p) => {
                  setLat(p.coords.latitude.toFixed(6));
                  setLng(p.coords.longitude.toFixed(6));
                  setErr(null);
                },
                (e) => setErr(e.message)
              )
            }
            className="h-[42px] rounded border px-3 text-sm"
          >
            Use my location
          </button>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-700">Date</label>
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </div>
      </section>

      {/* Error */}
      {err && (
        <div className="mt-3 rounded bg-red-50 px-3 py-2 text-red-700">
          {err}
        </div>
      )}

      {/* Results header */}
      <div className="mt-4 text-sm text-gray-600">
        {rows ? `${rows.length} results` : loading ? "Searching…" : " "}
      </div>

      {/* Results list */}
      <section className="mt-2 space-y-3">
        {loading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {!loading &&
          (rows ?? []).map((r) => (
            <article
              key={r.session_id}
              className="rounded-xl border p-4 shadow-sm"
            >
              <h3 className="text-base font-semibold">{r.activity_name}</h3>
              <p className="text-sm text-gray-700">{r.venue_name}</p>
              <p className="text-sm text-gray-600">
                {fmtRange(r.starts_at, r.ends_at)}
              </p>
              <p className="text-sm text-gray-600">
                {r.distance_km.toFixed(1)} km away
              </p>

              {r.price_cents != null && (
                <p className="text-sm text-gray-700">
                  {(r.price_cents / 100).toLocaleString(undefined, {
                    style: "currency",
                    currency: "EUR",
                  })}
                </p>
              )}

              {r.venue_lat != null && r.venue_lng != null && (
                <a
                  className="mt-2 inline-block text-sm text-brand-teal"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.google.com/maps/search/?api=1&query=${r.venue_lat},${r.venue_lng}`}
                >
                  Open in Maps
                </a>
              )}
            </article>
          ))}

        {!loading && (!rows || rows.length === 0) && (
          <div className="rounded-lg border border-dashed p-4 text-sm text-gray-600">
            No sessions found in this area. Try increasing the radius or picking
            different activities.
            <div className="mt-2">
              <button
                className="rounded border px-2 py-1 text-xs"
                onClick={() => {
                  setKm((k) => String(Math.max(5, Number(k) * 2 || 50)));
                  search();
                }}
              >
                Try again with a larger radius
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Sticky bottom Search (mobile-first affordance) */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center gap-3 sm:max-w-2xl">
          <button
            type="button"
            onClick={search}
            disabled={loading}
            className="flex-1 rounded bg-brand-teal px-4 py-3 text-center text-white disabled:opacity-50"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </div>
    </main>
  );
}
