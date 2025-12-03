"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase/browser";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

type VenueRow = {
  id: string;
  name: string;
  city_slug?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type SessionRow = {
  id: string;
  starts_at: string | null;
  ends_at: string | null;
  activities?: { name?: string | null; activity_types?: string[] | null } | null;
  venues?: { name?: string | null } | null;
};

type CategoryStat = { name: string; count: number };

type Metrics = { userCount: number; sessionCount: number; venueCount: number };

const formatDateTime = (value: string | null) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch (_) {
    return value;
  }
};

const deriveCategoryStats = (rows: SessionRow[]): CategoryStat[] => {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const categories = row.activities?.activity_types ?? [];
    categories?.forEach((category) => {
      if (!category) return;
      const key = category.toString();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
};

export default function AdminDashboard() {
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ userCount: 0, sessionCount: 0, venueCount: 0 });

  const allowList = useMemo(
    () =>
      (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
        .split(/[ ,]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    []
  );

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [venuesRes, sessionsRes, profilesRes] = await Promise.all([
        supabase.from("venues").select("id,name,city_slug,lat,lng").order("name"),
        supabase
          .from("sessions")
          .select("id,starts_at,ends_at,activities(name,activity_types),venues(name)")
          .order("starts_at", { ascending: false }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);

      if (venuesRes.error) throw venuesRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const nextVenues = (venuesRes.data ?? []) as VenueRow[];
      const nextSessions = (sessionsRes.data ?? []) as SessionRow[];
      setVenues(nextVenues);
      setSessions(nextSessions);
      setCategoryStats(deriveCategoryStats(nextSessions));
      setMetrics({
        userCount: profilesRes.count ?? 0,
        sessionCount: nextSessions.length,
        venueCount: nextVenues.length,
      });
    } catch (err) {
      setError(getErrorMessage(err) || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (cancelled) return;
        const em = auth?.user?.email ?? null;
        setEmail(em);
        const allowed = em ? allowList.includes(em.toLowerCase()) : false;
        setIsAdmin(allowed);
        if (allowed) {
          await refreshData();
        } else {
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err) || "Failed to verify admin access.");
          setIsAdmin(false);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowList, refreshData]);

  const handleDeleteSession = useCallback(async (id: string) => {
    if (!window.confirm("Delete this session?")) return;
    setBanner(null);
    setError(null);
    try {
      const { error: deleteError } = await supabase.from("sessions").delete().eq("id", id);
      if (deleteError) throw deleteError;
      setSessions((prev) => {
        const next = prev.filter((row) => row.id !== id);
        setCategoryStats(deriveCategoryStats(next));
        setMetrics((current) => ({ ...current, sessionCount: next.length }));
        return next;
      });
      setBanner("Session deleted.");
    } catch (err) {
      setError(getErrorMessage(err) || "Failed to delete session.");
    }
  }, []);

  const handleDeleteVenue = useCallback(async (id: string) => {
    if (!window.confirm("Delete this venue?")) return;
    setBanner(null);
    setError(null);
    try {
      const { error: deleteError } = await supabase.from("venues").delete().eq("id", id);
      if (deleteError) throw deleteError;
      setVenues((prev) => {
        const next = prev.filter((row) => row.id !== id);
        setMetrics((current) => ({ ...current, venueCount: next.length }));
        return next;
      });
      setBanner("Venue deleted.");
    } catch (err) {
      setError(getErrorMessage(err) || "Failed to delete venue.");
    }
  }, []);

  if (isAdmin === false) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-3 flex items-center gap-2">
          <Link href="/" className="text-brand-teal">&larr; Back</Link>
          <h1 className="text-lg font-semibold">Admin Dashboard</h1>
        </div>
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
          You don’t have access to this page.
          <div className="mt-2 text-sm text-red-600">Signed in as: {email ?? "(not signed in)"}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-xl font-semibold">Admin Dashboard</h1>
        <div className="ml-auto flex flex-wrap gap-3 text-sm">
          <Link href="/admin/new" className="text-brand-teal">Create Session</Link>
          <Link href="/admin/sessions" className="text-brand-teal">Manage Sessions</Link>
          <Link href="/admin/venues" className="text-brand-teal">Manage Venues</Link>
          <Link href="/admin/activities" className="text-brand-teal">Manage Activities</Link>
        </div>
      </div>

      {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-red-700">{error}</div>}
      {banner && <div className="mb-3 rounded bg-green-50 px-3 py-2 text-green-700">{banner}</div>}

      <section className="mb-6">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-lg font-semibold">Analytics</h2>
          <button onClick={refreshData} className="rounded border border-brand-teal px-3 py-1 text-sm text-brand-teal disabled:opacity-50" disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded border bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Users</p>
            <p className="text-2xl font-semibold">{metrics.userCount}</p>
          </div>
          <div className="rounded border bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Sessions</p>
            <p className="text-2xl font-semibold">{metrics.sessionCount}</p>
          </div>
          <div className="rounded border bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Venues</p>
            <p className="text-2xl font-semibold">{metrics.venueCount}</p>
          </div>
        </div>
        {categoryStats.length > 0 && (
          <div className="mt-4 rounded border bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-600">Top Categories</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {categoryStats.map((stat) => (
                <li key={stat.name} className="flex items-center justify-between text-sm">
                  <span>{stat.name}</span>
                  <span className="text-gray-500">{stat.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mb-8">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-lg font-semibold">All Sessions</h2>
          <Link href="/admin/sessions" className="text-sm text-brand-teal">Open detailed view</Link>
        </div>
        {loading && sessions.length === 0 ? (
          <p>Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-600">No sessions found.</p>
        ) : (
          <div className="overflow-x-auto rounded border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Activity</th>
                  <th className="px-3 py-2">Venue</th>
                  <th className="px-3 py-2">Starts</th>
                  <th className="px-3 py-2">Ends</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2">{row.activities?.name ?? "–"}</td>
                    <td className="px-3 py-2">{row.venues?.name ?? "–"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.starts_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.ends_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleDeleteSession(row.id)}
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-lg font-semibold">All Venues</h2>
          <Link href="/admin/venues" className="text-sm text-brand-teal">Open detailed view</Link>
        </div>
        {loading && venues.length === 0 ? (
          <p>Loading venues…</p>
        ) : venues.length === 0 ? (
          <p className="text-sm text-gray-600">No venues available.</p>
        ) : (
          <ul className="divide-y rounded border">
            {venues.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-sm text-gray-500">{row.city_slug ?? "city unknown"}</p>
                </div>
                <button
                  onClick={() => handleDeleteVenue(row.id)}
                  className="self-start rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
