"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  DEFAULT_DISPUTE_STATUS_TOKEN,
  DISPUTE_STATUS_TOKENS,
  type DisputeStatus,
} from "@/lib/disputes/statusTokens";
import { supabase } from "@/lib/supabase/browser";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

type AdminDispute = {
  id: string;
  sessionId: string;
  reporterId: string;
  status: DisputeStatus;
  reason: string;
  details: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  session: {
    id: string;
    title: string | null;
    venue: string | null;
    startsAt: string | null;
    endsAt: string | null;
  };
  reporter: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
  };
};

type ApiResponse = {
  disputes?: AdminDispute[];
  dispute?: AdminDispute | null;
  error?: string;
};

const STATUS_FILTERS: Array<{ value: DisputeStatus | "all"; label: string }> = [
  { value: "open", label: "Open" },
  { value: "reviewing", label: "In review" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

const STATUS_ACTIONS: Array<{ value: DisputeStatus; label: string; tone: "primary" | "muted" | "danger" }> = [
  { value: "reviewing", label: "Mark reviewing", tone: "primary" },
  { value: "resolved", label: "Resolve", tone: "primary" },
  { value: "dismissed", label: "Dismiss", tone: "danger" },
  { value: "open", label: "Re-open", tone: "muted" },
];

const toneClasses: Record<string, string> = {
  primary:
    "border-brand-teal text-brand-teal hover:bg-brand-teal hover:text-white focus-visible:ring-brand-teal/40",
  muted:
    "border-midnight-border text-ink-strong hover:border-brand-teal focus-visible:ring-midnight-border/30",
  danger:
    "border-feedback-danger text-feedback-danger hover:bg-feedback-danger hover:text-white focus-visible:ring-feedback-danger/40",
};

export default function AdminDisputes() {
  const searchParams = useSearchParams();
  const e2eBypass = useMemo(() => {
    const hasParam = searchParams?.get("e2e") === "1";
    const envEnabled = process.env.NEXT_PUBLIC_E2E_ADMIN_BYPASS === "true";
    const devMode = process.env.NODE_ENV !== "production";
    return hasParam && (envEnabled || devMode);
  }, [searchParams]);

  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<AdminDispute[]>([]);
  const [statusFilter, setStatusFilter] = useState<DisputeStatus | "all">("open");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let resolvedEmail: string | null = null;
      let allowListing = false;
      if (e2eBypass) {
        resolvedEmail = "playwright-admin@dowhat";
        allowListing = true;
      } else {
        const { data } = await supabase.auth.getUser();
        resolvedEmail = data?.user?.email ?? null;
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

  const refreshDisputes = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("status", statusFilter);
      const response = await fetch(`/api/admin/disputes?${params.toString()}`, { credentials: "include" });
      const payload: ApiResponse = await safeJson(response);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load disputes.");
      }
      const list = Array.isArray(payload?.disputes) ? payload.disputes : [];
      setRows(list);
      setNoteDrafts((prev) => {
        const next = { ...prev };
        list.forEach((row) => {
          if (next[row.id] === undefined) {
            next[row.id] = row.resolutionNotes ?? "";
          }
        });
        return next;
      });
    } catch (err) {
      setError(getErrorMessage(err) || "Failed to load disputes.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, statusFilter]);

  useEffect(() => {
    refreshDisputes();
  }, [refreshDisputes]);

  const updateDispute = useCallback(
    async (id: string, patch: { status?: DisputeStatus; resolutionNotes?: string | null }) => {
      setUpdatingId(id);
      setError(null);
      try {
        const response = await fetch("/api/admin/disputes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...patch }),
        });
        const payload: ApiResponse = await safeJson(response);
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to update dispute.");
        }
        if (payload?.dispute) {
          setRows((prev) => prev.map((row) => (row.id === payload.dispute!.id ? payload.dispute! : row)));
          setNoteDrafts((prev) => ({ ...prev, [payload.dispute!.id]: payload.dispute!.resolutionNotes ?? "" }));
        } else {
          await refreshDisputes();
        }
      } catch (err) {
        setError(getErrorMessage(err) || "Unable to update dispute.");
      } finally {
        setUpdatingId(null);
      }
    },
    [refreshDisputes],
  );

  const handleNoteSave = useCallback(
    (id: string) => {
      updateDispute(id, { resolutionNotes: noteDrafts[id] ?? "" });
    },
    [noteDrafts, updateDispute],
  );

  const handleStatusChange = useCallback(
    (id: string, nextStatus: DisputeStatus) => {
      updateDispute(id, { status: nextStatus });
    },
    [updateDispute],
  );

  if (isAdmin === false) {
    return (
      <main className="mx-auto max-w-5xl px-md py-xxl text-ink-strong">
        <div className="mb-md flex items-center gap-xs text-sm">
          <Link href="/admin" className="text-brand-teal">&larr; Back</Link>
          <h1 className="text-lg font-semibold text-ink-strong">Reliability disputes</h1>
        </div>
        <div className="rounded-xl border border-feedback-danger/30 bg-feedback-danger/5 p-md text-sm text-feedback-danger shadow-card">
          <p className="font-medium">You don’t have access to this page.</p>
          <div className="mt-xs text-xs text-feedback-danger/80">Signed in as: {email ?? "(not signed in)"}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-md py-xxl text-ink-strong">
      <div className="mb-md flex items-center gap-xs text-sm">
        <Link href="/admin" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-xl font-semibold text-ink-strong">Reliability disputes</h1>
      </div>

      <div className="mb-lg flex flex-wrap items-center gap-sm rounded-xl border border-midnight-border bg-surface p-md shadow-card">
        <div className="flex flex-wrap gap-xs">
          {STATUS_FILTERS.map((filter) => {
            const isActive = statusFilter === filter.value;
            return (
              <button
                key={filter.value}
                type="button"
                className={`rounded-full px-sm py-xxs text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 ${
                  isActive
                    ? "border-brand-teal bg-brand-teal text-white focus-visible:ring-brand-teal/40"
                    : "border-midnight-border text-ink-strong focus-visible:ring-midnight-border/30"
                }`}
                onClick={() => setStatusFilter(filter.value)}
                disabled={loading}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={refreshDisputes}
          className="ml-auto rounded-full border border-midnight-border px-sm py-xxs text-xs font-semibold text-ink-strong hover:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midnight-border/40"
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="mb-md rounded-xl border border-feedback-danger/30 bg-feedback-danger/5 px-sm py-xs text-sm text-feedback-danger">
          {error}
        </div>
      ) : null}

      {!loading && rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-midnight-border/60 bg-surface p-xl text-center text-sm text-ink-muted">
          No disputes match this filter.
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="text-sm text-ink-muted">Loading disputes…</p>
      ) : null}

      <div className="space-y-md">
        {rows.map((row) => {
          const statusToken = DISPUTE_STATUS_TOKENS[row.status] ?? DEFAULT_DISPUTE_STATUS_TOKEN;
          const noteDraft = noteDrafts[row.id] ?? "";
          const created = formatDate(row.createdAt);
          const resolved = row.resolvedAt ? formatDate(row.resolvedAt) : null;
          return (
            <article key={row.id} className="rounded-xl border border-midnight-border bg-surface p-md shadow-card">
              <div className="mb-sm flex flex-wrap items-center gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink-strong">{row.session.title ?? "Untitled session"}</p>
                  <p className="text-xs text-ink-muted">
                    {row.session.venue ?? "Venue tbd"}
                    {row.session.startsAt ? ` · ${formatDate(row.session.startsAt)}` : ""}
                  </p>
                </div>
                <span
                  className={`ml-auto inline-flex items-center rounded-full border px-sm py-xxs text-xs font-semibold ${statusToken.className}`}
                >
                  {statusToken.label}
                </span>
              </div>

              <dl className="grid gap-sm text-sm text-ink-strong sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Reporter</dt>
                  <dd>{row.reporter.name ?? row.reporterId}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Filed</dt>
                  <dd>{created}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Reason</dt>
                  <dd>{row.reason}</dd>
                </div>
                {row.details ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Details</dt>
                    <dd className="whitespace-pre-wrap text-ink-medium">{row.details}</dd>
                  </div>
                ) : null}
                {resolved ? (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Resolved</dt>
                    <dd>{resolved}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-md space-y-sm">
                <label className="text-xs font-semibold uppercase tracking-wide text-ink-muted" htmlFor={`notes-${row.id}`}>
                  Resolution notes
                </label>
                <textarea
                  id={`notes-${row.id}`}
                  value={noteDraft}
                  onChange={(event) =>
                    setNoteDrafts((prev) => ({
                      ...prev,
                      [row.id]: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-midnight-border px-sm py-xs text-sm text-ink-strong focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                  rows={3}
                  placeholder="Add moderation context for this dispute"
                />
                <div className="flex flex-wrap items-center gap-xs">
                  <button
                    type="button"
                    className="rounded-full border border-brand-teal px-sm py-xxs text-xs font-semibold text-brand-teal hover:bg-brand-teal hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/40"
                    onClick={() => handleNoteSave(row.id)}
                    disabled={updatingId === row.id}
                  >
                    {updatingId === row.id ? "Saving…" : "Save notes"}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-midnight-border px-sm py-xxs text-xs font-semibold text-ink-muted hover:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midnight-border/30"
                    onClick={() => setNoteDrafts((prev) => ({ ...prev, [row.id]: row.resolutionNotes ?? "" }))}
                    disabled={updatingId === row.id}
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="mt-md flex flex-wrap gap-xs">
                {STATUS_ACTIONS.map((action) => (
                  <button
                    key={action.value}
                    type="button"
                    onClick={() => handleStatusChange(row.id, action.value)}
                    disabled={updatingId === row.id || row.status === action.value}
                    className={`rounded-full border px-sm py-xxs text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 ${toneClasses[action.tone]}`}
                  >
                    {action.label}
                  </button>
                ))}
                <Link
                  href={`/sessions/${row.sessionId}`}
                  className="ml-auto rounded-full border border-midnight-border px-sm py-xxs text-xs font-semibold text-ink-strong hover:border-brand-teal"
                >
                  View session
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}

async function safeJson(response: Response): Promise<ApiResponse> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    return {};
  }
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}
