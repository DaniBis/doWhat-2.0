"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  ACTIVITY_TIME_FILTER_OPTIONS,
  ONBOARDING_TRAIT_GOAL,
  activityTaxonomy,
  defaultTier3Index,
  type ActivityTier3WithAncestors,
  type ActivityTimeFilterKey,
} from "@dowhat/shared";

import TaxonomyCategoryPicker from "@/components/TaxonomyCategoryPicker";
import { DISPUTE_STATUS_TOKENS, type DisputeStatus } from "@/lib/disputes/statusTokens";
import { buildSessionCloneQuery } from "@/lib/adminPrefill";
import { supabase } from "@/lib/supabase/browser";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";
import { cn } from "@/lib/utils/cn";
import type { SocialSweatAdoptionMetricsRow } from "@/types/database";

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

type AdoptionMetrics = {
  totalProfiles: number;
  sportStepCompleteCount: number;
  skillLevelMemberCount: number;
  traitGoalCount: number;
  pledgeAckCount: number;
  fullyReadyCount: number;
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
const DISPUTE_STATUS_ORDER: DisputeStatus[] = ["open", "reviewing", "resolved", "dismissed"];
const DISPUTE_STATUS_COLOR_MAP: Record<DisputeStatus, string> = {
  open: "bg-amber-400",
  reviewing: "bg-violet-400",
  resolved: "bg-brand-teal",
  dismissed: "bg-feedback-danger",
};
const ADMIN_DISPUTES_ROUTE = "/admin/disputes" as Route;

type MetricCardProps = {
  label: string;
  metric: MetricTrend;
  loading: boolean;
};

const isValidStatusCounts = (input: unknown): input is Record<DisputeStatus, number> => {
  if (!input || typeof input !== "object") return false;
  return Object.values(input).every((value) => typeof value === "number" && Number.isFinite(value));
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
    const hasParam = searchParams?.get("e2e") === "1";
    const envEnabled = process.env.NEXT_PUBLIC_E2E_ADMIN_BYPASS === "true";
    const devMode = process.env.NODE_ENV !== "production";
    return hasParam && (envEnabled || devMode);
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
  const [adoptionMetrics, setAdoptionMetrics] = useState<AdoptionMetrics | null>(null);
  const tier3Lookup = useMemo(() => buildTier3Lookup(), []);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState<ActivityTimeFilterKey>("any");
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [disputeSummary, setDisputeSummary] = useState<{ total: number | null; statusCounts: Partial<Record<DisputeStatus, number>> }>({
    total: null,
    statusCounts: {},
  });
  const [disputeSummaryLoading, setDisputeSummaryLoading] = useState(false);

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

      const [
        venuesRes,
        sessionsRes,
        profilesRes,
        profilesRecentRes,
        profilesPreviousRes,
        adoptionRes,
      ] = await Promise.all([
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
        supabase
          .from("social_sweat_adoption_metrics")
          .select("*")
          .limit(1)
          .maybeSingle<SocialSweatAdoptionMetricsRow>(),
      ]);

      if (venuesRes.error) throw venuesRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (profilesRecentRes.error) throw profilesRecentRes.error;
      if (profilesPreviousRes.error) throw profilesPreviousRes.error;
      if (adoptionRes.error) throw adoptionRes.error;

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

      const adoptionRow = adoptionRes.data ?? null;
      setAdoptionMetrics(
        adoptionRow
          ? {
              totalProfiles: adoptionRow.total_profiles ?? 0,
              sportStepCompleteCount: adoptionRow.sport_step_complete_count ?? 0,
              skillLevelMemberCount: adoptionRow.sport_skill_member_count ?? 0,
              traitGoalCount: adoptionRow.trait_goal_count ?? 0,
              pledgeAckCount: adoptionRow.pledge_ack_count ?? 0,
              fullyReadyCount: adoptionRow.fully_ready_count ?? 0,
            }
          : null,
      );
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

  const refreshDisputeSummary = useCallback(async () => {
    if (!isAdmin) return;
    setDisputeSummaryLoading(true);
    try {
      const response = await fetch("/api/admin/disputes?status=open&limit=1", { credentials: "include" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load disputes.");
      }
      const total = typeof payload.total === "number"
        ? payload.total
        : Array.isArray(payload.disputes)
          ? payload.disputes.length
          : null;
      const statusCounts = isValidStatusCounts(payload?.statusCounts)
        ? (payload.statusCounts as Record<DisputeStatus, number>)
        : {};
      setDisputeSummary({ total, statusCounts });
    } catch (err) {
      console.warn("[admin] Failed to load dispute summary", getErrorMessage(err));
      setDisputeSummary({ total: null, statusCounts: {} });
    } finally {
      setDisputeSummaryLoading(false);
    }
  }, [isAdmin]);

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
          await refreshDisputeSummary();
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
  }, [allowList, refreshData, refreshDisputeSummary, e2eBypass]);

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
      <main className="mx-auto max-w-4xl px-md py-xl">
        <div className="mb-sm flex items-center gap-xs">
          <Link href="/" className="text-brand-teal">&larr; Back</Link>
          <h1 className="text-lg font-semibold">Admin Dashboard</h1>
        </div>
        <div className="rounded border border-feedback-danger/30 bg-feedback-danger/5 p-md text-feedback-danger">
          You don’t have access to this page.
          <div className="mt-xs text-sm text-feedback-danger/80">Signed in as: {email ?? "(not signed in)"}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-md py-xl">
      <div className="mb-md flex flex-wrap items-center gap-xs">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-xl font-semibold">Admin Dashboard</h1>
        <div className="ml-auto flex flex-wrap gap-sm text-sm">
          <Link href="/admin/new" className="text-brand-teal">Create Session</Link>
          <Link href="/admin/sessions" className="text-brand-teal">Manage Sessions</Link>
          <Link href="/admin/venues" className="text-brand-teal">Manage Venues</Link>
          <Link href="/admin/activities" className="text-brand-teal">Manage Activities</Link>
          <Link href={ADMIN_DISPUTES_ROUTE} className="inline-flex items-center gap-xxs text-brand-teal">
            Moderate Disputes
            {isAdmin
              ? (() => {
                  const openCount =
                    disputeSummary.statusCounts.open ?? disputeSummary.total ?? null;
                  return typeof openCount === "number" ? (
                    <span
                      data-testid="admin-dispute-nav-pill"
                      className="rounded-full bg-feedback-danger/10 px-xxs text-[11px] font-semibold leading-none text-feedback-danger"
                    >
                      {openCount}
                    </span>
                  ) : null;
                })()
              : null}
          </Link>
        </div>
      </div>

      {isAdmin ? (
        <div className="mb-sm grid gap-xs rounded border border-brand-teal/30 bg-brand-teal/5 px-sm py-sm text-sm text-ink-strong">
          <div className="flex flex-wrap items-center gap-xs">
            <span className="font-semibold text-brand-teal">Reliability disputes</span>
            <span className="text-ink-strong">Monitor counts before opening the moderation queue.</span>
            <span className="rounded-full border border-brand-teal/50 bg-white/80 px-sm py-xxs text-xs font-semibold text-brand-teal">
              Open: {disputeSummary.statusCounts.open ?? disputeSummary.total ?? "—"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-xs text-xs">
            {DISPUTE_STATUS_ORDER.map((status) => {
              const token = DISPUTE_STATUS_TOKENS[status];
              const count = disputeSummary.statusCounts[status] ?? (status === "open" ? disputeSummary.total ?? null : null);
              return (
                <span key={status} className="inline-flex items-center gap-xxs rounded-full border border-brand-teal/30 bg-white/70 px-sm py-xxs font-semibold text-ink-strong">
                  <span className={cn("inline-flex h-2 w-2 rounded-full", DISPUTE_STATUS_COLOR_MAP[status] ?? "bg-ink-muted")} />
                  {token?.label ?? status}: {count ?? 0}
                </span>
              );
            })}
            <button
              type="button"
              onClick={refreshDisputeSummary}
              disabled={disputeSummaryLoading}
              className="ml-auto rounded-full border border-brand-teal/40 px-sm py-xxs font-semibold text-brand-teal/80 hover:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/40 disabled:opacity-60"
            >
              {disputeSummaryLoading ? "Refreshing…" : "Refresh counts"}
            </button>
            <Link href={ADMIN_DISPUTES_ROUTE} className="text-brand-teal">Open dashboard &rarr;</Link>
          </div>
        </div>
      ) : null}

      {error && (
        <div className="mb-sm rounded border border-feedback-danger/30 bg-feedback-danger/5 px-sm py-xs text-feedback-danger">
          {error}
        </div>
      )}
      {banner && (
        <div className="mb-sm rounded border border-feedback-success/30 bg-feedback-success/5 px-sm py-xs text-feedback-success">
          {banner}
        </div>
      )}

      <section className="mb-xl rounded border bg-surface p-md shadow-sm">
        <div className="mb-md flex flex-wrap items-center gap-sm">
          <div>
            <h2 className="text-lg font-semibold text-ink">Filter Sessions</h2>
            <p className="text-sm text-ink-muted">Use the shared taxonomy + time presets to narrow the admin views.</p>
          </div>
          <div className="ml-auto flex items-center gap-sm text-sm">
            {activeFiltersCount > 0 && (
              <span className="rounded-full bg-brand-teal/10 px-sm py-xxs text-brand-teal">
                {activeFiltersCount} active filter{activeFiltersCount === 1 ? "" : "s"}
              </span>
            )}
            <button
              onClick={clearFilters}
              className="rounded border border-midnight-border/60 px-sm py-xxs text-sm text-ink-strong hover:bg-surface-alt disabled:opacity-50"
              disabled={activeFiltersCount === 0}
            >
              Reset
            </button>
          </div>
        </div>
        <div className="grid gap-xl lg:grid-cols-[2fr_1fr]">
          <div>
            <p className="mb-xs text-sm font-medium text-ink-strong">Activity Categories</p>
            <TaxonomyCategoryPicker
              taxonomy={activityTaxonomy}
              selectedIds={selectedCategories}
              onToggle={toggleCategorySelection}
            />
          </div>
          <div>
            <p className="mb-xs text-sm font-medium text-ink-strong">Time of Day</p>
            <div className="flex flex-wrap gap-xs">
              {ACTIVITY_TIME_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setTimeFilter(option.key)}
                  className={`px-sm py-xs rounded-full border text-sm font-medium transition-colors ${
                    timeFilter === option.key
                      ? "border-brand-teal bg-brand-teal/10 text-brand-teal"
                      : "border-midnight-border/40 text-ink-strong hover:border-brand-teal/60"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-xl rounded border bg-surface p-md shadow-sm">
        <div className="flex flex-wrap items-center gap-sm">
          <div>
            <h2 className="text-lg font-semibold text-ink">Search &amp; Monitor</h2>
            <p className="text-sm text-ink-muted">Quickly narrow sessions or venues by name, city, or taxonomy matches.</p>
          </div>
          <div className="ml-auto flex w-full flex-col gap-xs sm:w-auto sm:flex-row sm:items-center">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search sessions or venues"
              className="w-full rounded border border-midnight-border/60 px-sm py-xs text-sm text-ink-strong focus:border-brand-teal focus:outline-none"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery("")}
                className="rounded border border-midnight-border/60 px-sm py-xxs text-sm text-ink-strong hover:bg-surface-alt"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-sm flex flex-wrap gap-sm text-xs text-ink-medium">
          <span className="rounded-full bg-surface-alt px-sm py-xxs">
            {filteredSessions.length} session{filteredSessions.length === 1 ? "" : "s"} match search
          </span>
          <span className="rounded-full bg-surface-alt px-sm py-xxs">
            {filteredVenues.length} venue{filteredVenues.length === 1 ? "" : "s"} match search
          </span>
          {normalizedSearch ? <span className="text-ink-muted">Query: “{searchQuery.trim()}”</span> : null}
        </div>
      </section>

      <section className="mb-xl">
        <div className="mb-sm flex items-center gap-sm">
          <h2 className="text-lg font-semibold">Analytics</h2>
          <button onClick={refreshData} className="rounded border border-brand-teal px-sm py-xxs text-sm text-brand-teal disabled:opacity-50" disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <div className="grid gap-sm sm:grid-cols-3">
          <MetricCard label="Users" metric={metrics.users} loading={loading} />
          <MetricCard label="Sessions" metric={metrics.sessions} loading={loading} />
          <MetricCard label="Venues" metric={metrics.venues} loading={loading} />
        </div>
        <GrowthHighlights metrics={metrics} loading={loading} />
        <section className="mt-md rounded border bg-surface p-md shadow-sm">
          <div className="flex flex-col gap-xxs sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-teal">doWhat Readiness</p>
              <h3 className="text-lg font-semibold text-ink">Onboarding Adoption</h3>
              <p className="text-sm text-ink-muted">Monitor sport, trait, and pledge completion ahead of GA.</p>
            </div>
            {adoptionMetrics ? (
              <span className="text-xs text-ink-muted">
                {adoptionMetrics.totalProfiles} profile{adoptionMetrics.totalProfiles === 1 ? "" : "s"} tracked
              </span>
            ) : null}
          </div>
          {adoptionMetrics ? (
            <div className="mt-md grid gap-sm md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <AdoptionMetricCard
                label="Sport & skill complete"
                value={adoptionMetrics.sportStepCompleteCount}
                total={adoptionMetrics.totalProfiles}
                helper="Primary sport, play style, and skill saved."
              />
              <AdoptionMetricCard
                label="Skill level saved"
                value={adoptionMetrics.skillLevelMemberCount}
                total={adoptionMetrics.totalProfiles}
                helper="Members who set a skill rating."
              />
              <AdoptionMetricCard
                label={`Trait goal (${ONBOARDING_TRAIT_GOAL})`}
                value={adoptionMetrics.traitGoalCount}
                total={adoptionMetrics.totalProfiles}
                helper={`${ONBOARDING_TRAIT_GOAL} base vibes confirmed.`}
              />
              <AdoptionMetricCard
                label="Reliability pledge"
                value={adoptionMetrics.pledgeAckCount}
                total={adoptionMetrics.totalProfiles}
                helper="Profiles that acknowledged the pledge."
              />
              <AdoptionMetricCard
                label="Fully ready"
                value={adoptionMetrics.fullyReadyCount}
                total={adoptionMetrics.totalProfiles}
                helper="Traits + sport + pledge complete."
              />
            </div>
          ) : (
            <p className="mt-md text-sm text-ink-muted">{loading ? "Loading adoption metrics…" : "No profiles available yet."}</p>
          )}
        </section>
        {filteredCategoryStats.length > 0 ? (
          <div className="mt-md rounded border bg-surface p-md shadow-sm">
            <p className="text-sm font-semibold text-ink-medium">
              Top Categories {activeFiltersCount ? "(filtered)" : ""}
            </p>
            <ul className="mt-xs grid gap-xs sm:grid-cols-2">
              {filteredCategoryStats.map((stat) => (
                <li key={stat.id} className="flex items-center justify-between text-sm">
                  <span>
                    {stat.label}
                    {stat.parentLabel ? (
                      <span className="ml-xs text-xs text-ink-muted">{stat.parentLabel}</span>
                    ) : null}
                  </span>
                  <span className="text-ink-muted">{stat.count}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-md text-sm text-ink-muted">No categories match the selected filters yet.</p>
        )}
      </section>

      <section className="mb-xxl">
        <div className="mb-xs flex items-center gap-xs">
          <h2 className="text-lg font-semibold">All Sessions</h2>
          <Link href="/admin/sessions" className="text-sm text-brand-teal">Open detailed view</Link>
        </div>
        {loading && sessions.length === 0 ? (
          <p>Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-ink-medium">No sessions found.</p>
        ) : filteredSessions.length === 0 ? (
          <p className="text-sm text-ink-medium">No sessions match the current filters or search query.</p>
        ) : (
          <div className="overflow-x-auto rounded border">
            <div className="flex items-center justify-between border-b px-sm py-xs text-xs text-ink-muted">
              <span>
                Showing {filteredSessions.length} of {sessions.length} sessions
                {activeFiltersCount ? " (filters applied)" : ""}
              </span>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-surface-alt text-left text-xs uppercase text-ink-muted">
                <tr>
                  <th className="px-sm py-xs">Activity</th>
                  <th className="px-sm py-xs">Venue</th>
                  <th className="px-sm py-xs">Starts</th>
                  <th className="px-sm py-xs">Ends</th>
                  <th className="px-sm py-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-sm py-xs">{row.activities?.name ?? "–"}</td>
                    <td className="px-sm py-xs">{row.venues?.name ?? "–"}</td>
                    <td className="px-sm py-xs whitespace-nowrap">{formatDateTime(row.starts_at)}</td>
                    <td className="px-sm py-xs whitespace-nowrap">{formatDateTime(row.ends_at)}</td>
                    <td className="px-sm py-xs">
                      <div className="flex flex-wrap justify-end gap-xs">
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
                          className="rounded border border-brand-teal/40 px-xs py-xxs text-xs font-semibold text-brand-teal hover:border-brand-teal"
                          aria-label={`Plan another session using ${row.activities?.name ?? 'this activity'}`}
                        >
                          Plan another
                        </Link>
                        <button
                          onClick={() => handleDeleteSession(row)}
                          className="rounded border border-feedback-danger/40 px-xs py-xxs text-xs text-feedback-danger hover:border-feedback-danger"
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
        <div className="mb-xs flex items-center gap-xs">
          <h2 className="text-lg font-semibold">All Venues</h2>
          <Link href="/admin/venues" className="text-sm text-brand-teal">Open detailed view</Link>
        </div>
        {loading && venues.length === 0 ? (
          <p>Loading venues…</p>
        ) : venues.length === 0 ? (
          <p className="text-sm text-ink-medium">No venues available.</p>
        ) : filteredVenues.length === 0 ? (
          <p className="text-sm text-ink-medium">No venues match the current search.</p>
        ) : (
          <ul className="divide-y rounded border">
            {filteredVenues.map((row) => (
              <li key={row.id} className="flex flex-col gap-xs px-sm py-xs sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-sm text-ink-muted">{row.city_slug ?? "city unknown"}</p>
                </div>
                <button
                  onClick={() => handleDeleteVenue(row)}
                  className="self-start rounded border border-feedback-danger/40 px-xs py-xxs text-xs text-feedback-danger hover:border-feedback-danger"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-xxl">
        <div className="mb-xs flex flex-wrap items-center gap-xs">
          <h2 className="text-lg font-semibold">Audit Log</h2>
          <button
            onClick={fetchAuditLogs}
            disabled={auditLoading}
            className="rounded border border-brand-teal px-sm py-xxs text-sm text-brand-teal disabled:opacity-50"
          >
            {auditLoading ? "Refreshing…" : "Refresh"}
          </button>
          <span className="text-xs text-ink-muted">Latest {auditLogs.length} actions</span>
          <a
            href="/api/admin/audit-logs?format=csv"
            className="text-xs text-brand-teal underline-offset-2 hover:underline"
            rel="noopener noreferrer"
          >
            Download CSV
          </a>
        </div>
        {auditError && (
          <div className="mb-sm rounded border border-feedback-danger/30 bg-feedback-danger/5 px-sm py-xs text-sm text-feedback-danger">
            {auditError}
          </div>
        )}
        {auditLogs.length === 0 ? (
          <p className="text-sm text-ink-medium">No recent admin actions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded border">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-alt text-left text-xs uppercase text-ink-muted">
                <tr>
                  <th className="px-sm py-xs">Action</th>
                  <th className="px-sm py-xs">Entity</th>
                  <th className="px-sm py-xs">Actor</th>
                  <th className="px-sm py-xs">Reason</th>
                  <th className="px-sm py-xs">Details</th>
                  <th className="px-sm py-xs">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} className="border-t">
                    <td className="px-sm py-xs font-medium text-ink-strong">{log.action}</td>
                    <td className="px-sm py-xs text-ink-medium">
                      {log.entity_type}
                      {log.entity_id ? <span className="ml-xxs text-xs text-ink-muted">#{log.entity_id}</span> : null}
                    </td>
                    <td className="px-sm py-xs text-ink-medium">{log.actor_email}</td>
                    <td className="px-sm py-xs text-ink-medium">{log.reason?.trim() || "–"}</td>
                    <td className="px-sm py-xs text-ink-medium">{formatAuditDetails(log.details)}</td>
                    <td className="px-sm py-xs text-ink-muted whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-xs text-xs text-ink-muted">Entries are stored in Supabase (`admin_audit_logs`) and mirror this session’s deletes.</p>
      </section>
    </main>
  );
}

const MetricCard = ({ label, metric, loading }: MetricCardProps) => {
  const deltaText = metric.delta === 0 ? "Flat vs prior 7d" : `${metric.delta > 0 ? "+" : ""}${metric.delta} vs prior 7d`;
  const deltaClass = cn("text-xs font-medium", {
    "text-feedback-success": metric.delta > 0,
    "text-ink-muted": metric.delta === 0,
    "text-feedback-danger": metric.delta < 0,
  });

  return (
    <div className="rounded-xl border border-midnight-border bg-surface p-lg shadow-card">
      <p className="text-sm font-medium text-ink-medium">{label}</p>
      <p className="mt-xxs text-2xl font-semibold text-ink-strong">{loading ? "…" : metric.total}</p>
      <p className="mt-xxs text-xs text-ink-muted">{loading ? "" : `${metric.recent} in last 7d`}</p>
      <p className={cn(deltaClass, "mt-xxs")}>{loading ? "" : deltaText}</p>
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
    <div className="mt-md grid gap-sm md:grid-cols-3">
      {highlights.map((item) => (
        <div
          key={item.key}
          className="rounded-xl border border-dashed border-midnight-border bg-surface-alt p-md text-sm shadow-card"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{item.label}</p>
          <p className="mt-xxs text-base font-semibold text-ink-strong">{loading ? "…" : describeTrend(item.metric)}</p>
          <p className="text-xs text-ink-muted">Last 7d vs. prior week</p>
        </div>
      ))}
    </div>
  );
};

type AdoptionMetricCardProps = {
  label: string;
  value: number;
  total: number;
  helper: string;
};

const AdoptionMetricCard = ({ label, value, total, helper }: AdoptionMetricCardProps) => {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-brand-teal/30 bg-surface p-lg shadow-card">
      <p className="text-sm font-semibold text-ink-strong">{label}</p>
      <p className="mt-xxs text-3xl font-bold text-ink-strong">{value}</p>
      <p className="text-xs text-ink-medium">{total > 0 ? `${percent}% of ${total}` : "Awaiting first members"}</p>
      <p className="mt-xxs text-xs text-ink-muted">{helper}</p>
    </div>
  );
};
