"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  ACTIVITY_TIME_FILTER_OPTIONS,
  activityTaxonomy,
  defaultTier3Index,
  type ActivityTier3WithAncestors,
  type ActivityTimeFilterKey,
} from "@dowhat/shared";

import TaxonomyCategoryPicker from "@/components/TaxonomyCategoryPicker";
import { buildSessionCloneQuery } from "@/lib/adminPrefill";
import { supabase } from "@/lib/supabase/browser";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";
import { cn } from "@/lib/utils/cn";

type VenueRow = {
  id: string;
  name: string;
  city_slug?: string | null;
  lat?: number | null;
  lng?: number | null;
  created_at?: string | null;
};

type SessionRow = {
  id: string;
  activity_id?: string | null;
  venue_id?: string | null;
  price_cents?: number | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at?: string | null;
  activities?: { id?: string | null; name?: string | null; activity_types?: (string | null)[] | null } | null;
  venues?: { id?: string | null; name?: string | null; address?: string | null; lat?: number | null; lng?: number | null } | null;
};

type CategoryStat = { id: string; label: string; parentLabel?: string | null; count: number };

type MetricTrend = {
  total: number;
  recent: number;
  previous: number;
  delta: number;
};

type Metrics = {
  users: MetricTrend;
  sessions: MetricTrend;
  venues: MetricTrend;
};

type AuditLogRow = {
  id: string;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  reason?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
};

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const AUDIT_LOG_LIMIT = 25;

type MetricCardProps = {
  label: string;
  metric: MetricTrend;
  loading: boolean;
};

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

type Tier3Lookup = {
  byId: Map<string, ActivityTier3WithAncestors>;
  byLabel: Map<string, ActivityTier3WithAncestors>;
};

const buildTier3Lookup = (): Tier3Lookup => {
  const byId = new Map<string, ActivityTier3WithAncestors>();
  const byLabel = new Map<string, ActivityTier3WithAncestors>();
  defaultTier3Index.forEach((entry) => {
    byId.set(entry.id, entry);
    byLabel.set(entry.label.toLowerCase(), entry);
  });
  return { byId, byLabel };
};

const resolveTier3 = (value: string, lookup: Tier3Lookup): ActivityTier3WithAncestors | null => {
  return lookup.byId.get(value) ?? lookup.byLabel.get(value.toLowerCase()) ?? null;
};

const deriveCategoryStats = (rows: SessionRow[], lookup: Tier3Lookup): CategoryStat[] => {
  const counts = new Map<string, CategoryStat>();
  rows.forEach((row) => {
    const categories = row.activities?.activity_types ?? [];
    categories?.forEach((category) => {
      const trimmed = category?.trim();
      if (!trimmed) return;
      const entry = resolveTier3(trimmed, lookup);
      const key = entry?.id ?? trimmed;
      const label = entry?.label ?? trimmed;
      const parentLabel = entry?.tier1Label ?? entry?.tier2Label ?? null;
      const current = counts.get(key);
      if (current) {
        current.count += 1;
      } else {
        counts.set(key, { id: key, label, parentLabel, count: 1 });
      }
    });
  });
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
};

const describeTrend = (metric: MetricTrend) => {
  if (metric.previous === 0 && metric.recent === 0) return "No activity in prior periods";
  if (metric.previous === 0) return "Fresh growth vs. prior 7d";
  const percent = ((metric.recent - metric.previous) / Math.max(metric.previous, 1)) * 100;
  const rounded = Math.round(percent);
  if (rounded === 0) return "Flat vs. prior week";
  return `${rounded > 0 ? "+" : ""}${rounded}% vs. prior week`;
};

const formatAuditDetails = (details?: Record<string, unknown> | null) => {
  if (!details) return "–";
  const entries = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${String(value)}`);
  return entries.length ? entries.join(" · ") : "–";
};

export default function AdminDashboard() {
  const searchParams = useSearchParams();
  const e2eBypass = useMemo(() => {
    return process.env.NEXT_PUBLIC_E2E_ADMIN_BYPASS === "true" && searchParams?.get("e2e") === "1";
  }, [searchParams]);
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    users: { total: 0, recent: 0, previous: 0, delta: 0 },
    sessions: { total: 0, recent: 0, previous: 0, delta: 0 },
    venues: { total: 0, recent: 0, previous: 0, delta: 0 },
  });
  const tier3Lookup = useMemo(() => buildTier3Lookup(), []);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState<ActivityTimeFilterKey>("any");
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const computeWeekTrend = useCallback(<T,>(rows: T[], getCreatedAt: (row: T) => string | null | undefined) => {
    const now = Date.now();
    const currentWindowStart = now - ONE_WEEK_MS;
    const previousWindowStart = now - ONE_WEEK_MS * 2;
    let recent = 0;
    let previous = 0;
    rows.forEach((row) => {
      const rawValue = getCreatedAt(row);
      if (!rawValue) return;
      const timestamp = Date.parse(rawValue);
      if (Number.isNaN(timestamp)) return;
      if (timestamp >= currentWindowStart) {
        recent += 1;
      } else if (timestamp >= previousWindowStart && timestamp < currentWindowStart) {
        previous += 1;
      }
    });
    return { recent, previous, delta: recent - previous };
  }, []);

  const allowList = useMemo(
    () =>
      (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
        .split(/[ ,]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    []
  );

  const toggleCategorySelection = useCallback((id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  }, []);

  const resolveTimeKeyForSession = useCallback(
    (row: SessionRow): ActivityTimeFilterKey => {
      const source = row.starts_at ?? row.ends_at;
      if (!source) return "any";
      const date = new Date(source);
      if (Number.isNaN(date.getTime())) return "any";
      const hour = date.getHours();
      if (hour >= 6 && hour < 9) return "early";
      if (hour >= 9 && hour < 12) return "morning";
      if (hour >= 12 && hour < 18) return "afternoon";
      if (hour >= 18 && hour < 21) return "evening";
      return "night";
    },
    []
  );

  const clearFilters = useCallback(() => {
    setSelectedCategories([]);
    setTimeFilter("any");
  }, []);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = Date.now();
      const currentWindowStartIso = new Date(now - ONE_WEEK_MS).toISOString();
      const previousWindowStartIso = new Date(now - ONE_WEEK_MS * 2).toISOString();

      const [venuesRes, sessionsRes, profilesRes, profilesRecentRes, profilesPreviousRes] = await Promise.all([
        supabase.from("venues").select("id,name,city_slug,lat,lng,created_at").order("name"),
        supabase
          .from("sessions")
          .select(
            "id,activity_id,venue_id,price_cents,starts_at,ends_at,created_at,activities(id,name,activity_types),venues(id,name,address,lat,lng)",
          )
          .order("starts_at", { ascending: false }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .gte("created_at", currentWindowStartIso),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .gte("created_at", previousWindowStartIso)
          .lt("created_at", currentWindowStartIso),
      ]);

      if (venuesRes.error) throw venuesRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (profilesRecentRes.error) throw profilesRecentRes.error;
      if (profilesPreviousRes.error) throw profilesPreviousRes.error;

      const nextVenues = (venuesRes.data ?? []) as VenueRow[];
      const nextSessions = (sessionsRes.data ?? []) as SessionRow[];
      const sessionTrend = computeWeekTrend(nextSessions, (row) => row.created_at ?? row.starts_at);
      const venueTrend = computeWeekTrend(nextVenues, (row) => row.created_at);
      const userTrend = {
        recent: profilesRecentRes.count ?? 0,
        previous: profilesPreviousRes.count ?? 0,
        delta: (profilesRecentRes.count ?? 0) - (profilesPreviousRes.count ?? 0),
      };

      setVenues(nextVenues);
      setSessions(nextSessions);
      setMetrics({
        users: {
          total: profilesRes.count ?? 0,
          ...userTrend,
        },
        sessions: {
          total: nextSessions.length,
          ...sessionTrend,
        },
        venues: {
          total: nextVenues.length,
          ...venueTrend,
        },
      });
    } catch (err) {
      setError(getErrorMessage(err) || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [computeWeekTrend]);

  const filteredSessions = useMemo(() => {
    if (!selectedCategories.length && timeFilter === "any" && !normalizedSearch) return sessions;
    const idSet = new Set(selectedCategories);
    const labelSet = new Set(
      selectedCategories
        .map((id) => tier3Lookup.byId.get(id)?.label.toLowerCase())
        .filter(Boolean) as string[]
    );
    return sessions.filter((row) => {
      if (selectedCategories.length) {
        const categories = row.activities?.activity_types ?? [];
        const hasMatch = categories?.some((value) => {
          const trimmed = value?.trim();
          if (!trimmed) return false;
          if (idSet.has(trimmed)) return true;
          const entry = resolveTier3(trimmed, tier3Lookup);
          if (entry && idSet.has(entry.id)) return true;
          if (labelSet.size && labelSet.has(trimmed.toLowerCase())) return true;
          return false;
        });
        if (!hasMatch) return false;
      }
      if (normalizedSearch) {
        const target = [
          row.activities?.name,
          row.venues?.name,
          row.activities?.activity_types?.join(" "),
          row.id,
        ]
          .filter(Boolean)
          .map((value) => value?.toLowerCase() ?? "");
        const hasSearchMatch = target.some((value) => value.includes(normalizedSearch));
        if (!hasSearchMatch) return false;
      }
      if (timeFilter !== "any") {
        return resolveTimeKeyForSession(row) === timeFilter;
      }
      return true;
    });
  }, [sessions, selectedCategories, timeFilter, tier3Lookup, resolveTimeKeyForSession, normalizedSearch]);

  const filteredCategoryStats = useMemo(
    () => deriveCategoryStats(filteredSessions, tier3Lookup),
    [filteredSessions, tier3Lookup]
  );

  const filteredVenues = useMemo(() => {
    if (!normalizedSearch) return venues;
    return venues.filter((row) => {
      const haystack = [row.name, row.city_slug, row.id].filter(Boolean).map((value) => value!.toLowerCase());
      return haystack.some((value) => value.includes(normalizedSearch));
    });
  }, [venues, normalizedSearch]);

  const activeFiltersCount = selectedCategories.length + (timeFilter !== "any" ? 1 : 0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let em: string | null = null;
        let allowed = false;
        if (e2eBypass) {
          em = "playwright-admin@dowhat";
          allowed = true;
        } else {
          const { data: auth } = await supabase.auth.getUser();
          if (cancelled) return;
          em = auth?.user?.email ?? null;
          allowed = em ? allowList.includes(em.toLowerCase()) : false;
        }
        if (cancelled) return;
        setEmail(em);
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
  }, [allowList, refreshData, e2eBypass]);

  const fetchAuditLogs = useCallback(async () => {
    if (!isAdmin) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const { data, error: auditErr } = await supabase
        .from("admin_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(AUDIT_LOG_LIMIT);
      if (auditErr) throw auditErr;
      setAuditLogs((data ?? []) as AuditLogRow[]);
    } catch (err) {
      setAuditError(getErrorMessage(err) || "Failed to load audit logs.");
    } finally {
      setAuditLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      fetchAuditLogs();
    }
  }, [isAdmin, fetchAuditLogs]);

  const recordAuditLog = useCallback(
    async (entry: Omit<AuditLogRow, "id" | "created_at" | "actor_email">) => {
      if (!email) return;
      try {
        const { data, error: insertError } = await supabase
          .from("admin_audit_logs")
          .insert({ ...entry, actor_email: email })
          .select()
          .single();
        if (insertError) throw insertError;
        if (data) {
          setAuditLogs((prev) => {
            const next = [data as AuditLogRow, ...prev];
            return next.slice(0, AUDIT_LOG_LIMIT);
          });
        }
      } catch (err) {
        setAuditError(getErrorMessage(err) || "Failed to record audit log.");
      }
    },
    [email]
  );

  const handleDeleteSession = useCallback(async (row: SessionRow) => {
    if (!window.confirm("Delete this session?")) return;
    const reason = window.prompt("Add a short reason for this deletion (optional)", "") ?? undefined;
    setBanner(null);
    setError(null);
    try {
      const { error: deleteError } = await supabase.from("sessions").delete().eq("id", row.id);
      if (deleteError) throw deleteError;
      setSessions((prev) => {
        const next = prev.filter((current) => current.id !== row.id);
        const nextTrend = computeWeekTrend(next, (row) => row.created_at ?? row.starts_at);
        setMetrics((current) => ({
          ...current,
          sessions: {
            total: next.length,
            ...nextTrend,
          },
        }));
        return next;
      });
      setBanner("Session deleted.");
      await recordAuditLog({
        action: "delete_session",
        entity_type: "session",
        entity_id: row.id,
        reason,
        details: {
          activityName: row.activities?.name ?? null,
          venueName: row.venues?.name ?? null,
          starts_at: row.starts_at,
        },
      });
    } catch (err) {
      setError(getErrorMessage(err) || "Failed to delete session.");
    }
  }, [computeWeekTrend, recordAuditLog]);

  const handleDeleteVenue = useCallback(async (row: VenueRow) => {
    if (!window.confirm("Delete this venue?")) return;
    const reason = window.prompt("Add a short reason for this deletion (optional)", "") ?? undefined;
    setBanner(null);
    setError(null);
    try {
      const { error: deleteError } = await supabase.from("venues").delete().eq("id", row.id);
      if (deleteError) throw deleteError;
      setVenues((prev) => {
        const next = prev.filter((current) => current.id !== row.id);
        const nextTrend = computeWeekTrend(next, (row) => row.created_at);
        setMetrics((current) => ({
          ...current,
          venues: {
            total: next.length,
            ...nextTrend,
          },
        }));
        return next;
      });
      setBanner("Venue deleted.");
      await recordAuditLog({
        action: "delete_venue",
        entity_type: "venue",
        entity_id: row.id,
        reason,
        details: {
          venueName: row.name,
          city: row.city_slug,
        },
      });
    } catch (err) {
      setError(getErrorMessage(err) || "Failed to delete venue.");
    }
  }, [computeWeekTrend, recordAuditLog]);

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

      <section className="mb-6 rounded border bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Filter Sessions</h2>
            <p className="text-sm text-gray-500">Use the shared taxonomy + time presets to narrow the admin views.</p>
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {activeFiltersCount > 0 && (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                {activeFiltersCount} active filter{activeFiltersCount === 1 ? "" : "s"}
              </span>
            )}
            <button
              onClick={clearFilters}
              className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              disabled={activeFiltersCount === 0}
            >
              Reset
            </button>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Activity Categories</p>
            <TaxonomyCategoryPicker
              taxonomy={activityTaxonomy}
              selectedIds={selectedCategories}
              onToggle={toggleCategorySelection}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Time of Day</p>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TIME_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setTimeFilter(option.key)}
                  className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                    timeFilter === option.key
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-700 hover:border-blue-400"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Search &amp; Monitor</h2>
            <p className="text-sm text-gray-500">Quickly narrow sessions or venues by name, city, or taxonomy matches.</p>
          </div>
          <div className="ml-auto flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search sessions or venues"
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:border-brand-teal focus:outline-none"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery("")}
                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
          <span className="rounded-full bg-gray-100 px-3 py-1">
            {filteredSessions.length} session{filteredSessions.length === 1 ? "" : "s"} match search
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1">
            {filteredVenues.length} venue{filteredVenues.length === 1 ? "" : "s"} match search
          </span>
          {normalizedSearch ? <span className="text-gray-500">Query: “{searchQuery.trim()}”</span> : null}
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-lg font-semibold">Analytics</h2>
          <button onClick={refreshData} className="rounded border border-brand-teal px-3 py-1 text-sm text-brand-teal disabled:opacity-50" disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Users" metric={metrics.users} loading={loading} />
          <MetricCard label="Sessions" metric={metrics.sessions} loading={loading} />
          <MetricCard label="Venues" metric={metrics.venues} loading={loading} />
        </div>
        <GrowthHighlights metrics={metrics} loading={loading} />
        {filteredCategoryStats.length > 0 ? (
          <div className="mt-4 rounded border bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-600">
              Top Categories {activeFiltersCount ? "(filtered)" : ""}
            </p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {filteredCategoryStats.map((stat) => (
                <li key={stat.id} className="flex items-center justify-between text-sm">
                  <span>
                    {stat.label}
                    {stat.parentLabel ? (
                      <span className="ml-2 text-xs text-gray-500">{stat.parentLabel}</span>
                    ) : null}
                  </span>
                  <span className="text-gray-500">{stat.count}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">No categories match the selected filters yet.</p>
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
        ) : filteredSessions.length === 0 ? (
          <p className="text-sm text-gray-600">No sessions match the current filters or search query.</p>
        ) : (
          <div className="overflow-x-auto rounded border">
            <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-gray-500">
              <span>
                Showing {filteredSessions.length} of {sessions.length} sessions
                {activeFiltersCount ? " (filters applied)" : ""}
              </span>
            </div>
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
                {filteredSessions.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2">{row.activities?.name ?? "–"}</td>
                    <td className="px-3 py-2">{row.venues?.name ?? "–"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.starts_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.ends_at)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          href={{
                            pathname: "/admin/new",
                            query: buildSessionCloneQuery(
                              {
                                activityId: row.activity_id ?? row.activities?.id ?? null,
                                activityName: row.activities?.name ?? null,
                                activityTypes: row.activities?.activity_types ?? null,
                                venueId: row.venue_id ?? row.venues?.id ?? null,
                                venueName: row.venues?.name ?? null,
                                venueAddress: row.venues?.address ?? null,
                                venueLat: row.venues?.lat ?? null,
                                venueLng: row.venues?.lng ?? null,
                                priceCents: row.price_cents ?? null,
                                startsAt: row.starts_at,
                                endsAt: row.ends_at,
                              },
                              { source: "admin_dashboard_session" },
                            ),
                          }}
                          className="rounded border border-emerald-300 px-2 py-1 text-xs font-semibold text-emerald-700 hover:border-emerald-400"
                          aria-label={`Plan another session using ${row.activities?.name ?? 'this activity'}`}
                        >
                          Plan another
                        </Link>
                        <button
                          onClick={() => handleDeleteSession(row)}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                        >
                          Delete
                        </button>
                      </div>
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
        ) : filteredVenues.length === 0 ? (
          <p className="text-sm text-gray-600">No venues match the current search.</p>
        ) : (
          <ul className="divide-y rounded border">
            {filteredVenues.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-sm text-gray-500">{row.city_slug ?? "city unknown"}</p>
                </div>
                <button
                  onClick={() => handleDeleteVenue(row)}
                  className="self-start rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Audit Log</h2>
          <button
            onClick={fetchAuditLogs}
            disabled={auditLoading}
            className="rounded border border-brand-teal px-3 py-1 text-sm text-brand-teal disabled:opacity-50"
          >
            {auditLoading ? "Refreshing…" : "Refresh"}
          </button>
          <span className="text-xs text-gray-500">Latest {auditLogs.length} actions</span>
          <Link
            href="/api/admin/audit-logs?format=csv"
            className="text-xs text-brand-teal underline-offset-2 hover:underline"
            prefetch={false}
          >
            Download CSV
          </Link>
        </div>
        {auditError && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{auditError}</div>}
        {auditLogs.length === 0 ? (
          <p className="text-sm text-gray-600">No recent admin actions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Entity</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Details</th>
                  <th className="px-3 py-2">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} className="border-t">
                    <td className="px-3 py-2 font-medium text-gray-800">{log.action}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {log.entity_type}
                      {log.entity_id ? <span className="ml-1 text-xs text-gray-400">#{log.entity_id}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{log.actor_email}</td>
                    <td className="px-3 py-2 text-gray-600">{log.reason?.trim() || "–"}</td>
                    <td className="px-3 py-2 text-gray-600">{formatAuditDetails(log.details)}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-500">Entries are stored in Supabase (`admin_audit_logs`) and mirror this session’s deletes.</p>
      </section>
    </main>
  );
}

const MetricCard = ({ label, metric, loading }: MetricCardProps) => {
  const deltaText = metric.delta === 0 ? "Flat vs prior 7d" : `${metric.delta > 0 ? "+" : ""}${metric.delta} vs prior 7d`;
  const deltaClass = cn("text-xs font-medium", {
    "text-emerald-600": metric.delta > 0,
    "text-gray-500": metric.delta === 0,
    "text-red-600": metric.delta < 0,
  });

  return (
    <div className="rounded border bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-semibold">{loading ? "..." : metric.total}</p>
      <p className="text-xs text-gray-500">{loading ? "" : `${metric.recent} in last 7d`}</p>
      <p className={deltaClass}>{loading ? "" : deltaText}</p>
    </div>
  );
};

const GrowthHighlights = ({ metrics, loading }: { metrics: Metrics; loading: boolean }) => {
  const highlights = [
    { key: "users", label: "User signups", metric: metrics.users },
    { key: "sessions", label: "Sessions created", metric: metrics.sessions },
    { key: "venues", label: "Venues verified", metric: metrics.venues },
  ];
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      {highlights.map((item) => (
        <div key={item.key} className="rounded border border-dashed bg-white/70 p-3 text-sm shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">{item.label}</p>
          <p className="text-base font-semibold text-gray-900">{loading ? "…" : describeTrend(item.metric)}</p>
          <p className="text-xs text-gray-500">Last 7d vs. prior week</p>
        </div>
      ))}
    </div>
  );
};
