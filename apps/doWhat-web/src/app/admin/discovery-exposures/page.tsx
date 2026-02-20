"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { supabase } from "@/lib/supabase/browser";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

type ExposureSummary = {
  cacheHitRate: number;
  degradedRate: number;
  avgReturnedItems: number;
  avgAfterConfidenceGate: number;
  droppedNotPlaceBacked: number;
  droppedLowConfidence: number;
  droppedDeduped: number;
  avgTopRankScore: number | null;
};

type ExposurePayload = {
  window: {
    days: number;
    limit: number;
    cutoffIso: string;
    rowsConsidered: number;
  };
  summary: ExposureSummary;
  topSources: Array<{ source: string; count: number }>;
  timeseries: Array<{ hourIso: string; count: number }>;
  error?: string;
};

const formatPct = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
};

const formatNumber = (value: number | null | undefined, digits = 0) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
};

export default function AdminDiscoveryExposuresPage() {
  const searchParams = useSearchParams();
  const e2eBypass = useMemo(() => {
    const hasParam = searchParams?.get("e2e") === "1";
    const envEnabled = process.env.NEXT_PUBLIC_E2E_ADMIN_BYPASS === "true";
    const devMode = process.env.NODE_ENV !== "production";
    return hasParam && (envEnabled || devMode);
  }, [searchParams]);

  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [days, setDays] = useState<number>(7);
  const [limit, setLimit] = useState<number>(2000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExposurePayload | null>(null);

  useEffect(() => {
    (async () => {
      let resolvedEmail: string | null = null;
      let allowListing = false;
      if (e2eBypass) {
        resolvedEmail = "playwright-admin@dowhat";
        allowListing = true;
      } else {
        const { data: authData } = await supabase.auth.getUser();
        resolvedEmail = authData?.user?.email ?? null;
        const allow = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
          .split(/[ ,]+/)
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean);
        allowListing = resolvedEmail ? allow.includes(resolvedEmail.toLowerCase()) : false;
      }
      setEmail(resolvedEmail);
      setIsAdmin(allowListing);
    })();
  }, [e2eBypass]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("days", String(days));
      params.set("limit", String(limit));
      const response = await fetch(`/api/admin/discovery-exposures?${params.toString()}`, {
        credentials: "include",
      });
      const payload = (await response.json()) as ExposurePayload;
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load discovery analytics.");
      }
      setData(payload);
    } catch (err) {
      setError(getErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days, isAdmin, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isAdmin === false) {
    return (
      <main className="mx-auto max-w-6xl px-md py-xl text-ink-strong">
        <div className="mb-sm flex items-center gap-xs">
          <Link href="/admin" className="text-brand-teal">&larr; Back</Link>
          <h1 className="text-lg font-semibold">Discovery analytics</h1>
        </div>
        <div className="rounded border border-feedback-danger/30 bg-feedback-danger/5 p-md text-feedback-danger">
          You don’t have access to this page.
          <div className="mt-xs text-sm text-feedback-danger/80">Signed in as: {email ?? "(not signed in)"}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-md py-xl text-ink-strong">
      <div className="mb-md flex flex-wrap items-center gap-xs">
        <Link href="/admin" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-xl font-semibold">Discovery analytics</h1>
        <div className="ml-auto flex items-center gap-xs text-xs text-ink-muted">
          <span>Admin telemetry view</span>
        </div>
      </div>

      <div className="mb-md flex flex-wrap items-end gap-sm rounded-xl border border-midnight-border bg-surface p-md shadow-card">
        <label className="text-sm">
          <span className="mb-xxs block text-xs font-semibold uppercase tracking-wide text-ink-muted">Window (days)</span>
          <input
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(event) => setDays(Math.min(90, Math.max(1, Number(event.target.value) || 7)))}
            className="w-28 rounded-lg border border-midnight-border px-sm py-xxs"
          />
        </label>
        <label className="text-sm">
          <span className="mb-xxs block text-xs font-semibold uppercase tracking-wide text-ink-muted">Rows (limit)</span>
          <input
            type="number"
            min={1}
            max={5000}
            value={limit}
            onChange={(event) => setLimit(Math.min(5000, Math.max(1, Number(event.target.value) || 2000)))}
            className="w-32 rounded-lg border border-midnight-border px-sm py-xxs"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || !isAdmin}
          className="rounded-full border border-brand-teal px-sm py-xxs text-xs font-semibold text-brand-teal disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="mb-md rounded border border-feedback-danger/30 bg-feedback-danger/5 px-sm py-xs text-feedback-danger">
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          <section className="mb-md grid gap-sm sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard title="Cache hit rate" value={formatPct(data.summary.cacheHitRate)} />
            <MetricCard title="Degraded rate" value={formatPct(data.summary.degradedRate)} />
            <MetricCard title="Avg returned" value={formatNumber(data.summary.avgReturnedItems, 2)} />
            <MetricCard title="Avg top score" value={formatNumber(data.summary.avgTopRankScore, 4)} />
          </section>

          <section className="mb-md rounded-xl border border-midnight-border bg-surface p-md shadow-card">
            <h2 className="text-lg font-semibold text-ink">Gating impact</h2>
            <div className="mt-sm grid gap-sm sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard title="After confidence gate" value={formatNumber(data.summary.avgAfterConfidenceGate, 2)} compact />
              <MetricCard title="Dropped: not place-backed" value={formatNumber(data.summary.droppedNotPlaceBacked)} compact />
              <MetricCard title="Dropped: low confidence" value={formatNumber(data.summary.droppedLowConfidence)} compact />
              <MetricCard title="Dropped: deduped" value={formatNumber(data.summary.droppedDeduped)} compact />
            </div>
          </section>

          <section className="mb-md grid gap-md lg:grid-cols-2">
            <article className="rounded-xl border border-midnight-border bg-surface p-md shadow-card">
              <h3 className="text-base font-semibold text-ink">Top sources</h3>
              <ul className="mt-sm space-y-xxs text-sm">
                {data.topSources.length === 0 ? (
                  <li className="text-ink-muted">No source data in window.</li>
                ) : (
                  data.topSources.map((entry) => (
                    <li key={entry.source} className="flex items-center justify-between gap-sm">
                      <span className="text-ink-strong">{entry.source}</span>
                      <span className="text-ink-muted">{entry.count}</span>
                    </li>
                  ))
                )}
              </ul>
            </article>

            <article className="rounded-xl border border-midnight-border bg-surface p-md shadow-card">
              <h3 className="text-base font-semibold text-ink">Exposure timeseries</h3>
              <ul className="mt-sm space-y-xxs text-sm">
                {data.timeseries.length === 0 ? (
                  <li className="text-ink-muted">No timeseries data in window.</li>
                ) : (
                  data.timeseries.slice(-24).map((point) => (
                    <li key={point.hourIso} className="flex items-center justify-between gap-sm">
                      <span className="text-ink-strong">
                        {new Date(point.hourIso).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                        })}
                      </span>
                      <span className="text-ink-muted">{point.count}</span>
                    </li>
                  ))
                )}
              </ul>
            </article>
          </section>

          <section className="rounded-xl border border-midnight-border bg-surface p-md shadow-card text-xs text-ink-muted">
            <p>
              Rows considered: <span className="font-semibold text-ink-strong">{data.window.rowsConsidered}</span>
              {" · "}
              Cutoff: <span className="font-semibold text-ink-strong">{new Date(data.window.cutoffIso).toLocaleString()}</span>
            </p>
          </section>
        </>
      ) : (
        <section className="rounded-xl border border-dashed border-midnight-border/60 bg-surface p-xl text-center text-sm text-ink-muted">
          {loading ? "Loading discovery analytics…" : "No analytics data yet."}
        </section>
      )}
    </main>
  );
}

function MetricCard({ title, value, compact = false }: { title: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-lg border border-midnight-border/50 bg-surface-alt ${compact ? "p-sm" : "p-md"}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</div>
      <div className={`font-semibold text-ink-strong ${compact ? "mt-xxs text-lg" : "mt-xs text-2xl"}`}>{value}</div>
    </div>
  );
}
