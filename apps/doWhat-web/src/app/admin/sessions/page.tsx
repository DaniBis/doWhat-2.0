"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import SaveToggleButton from "@/components/SaveToggleButton";
import { buildSessionSavePayload, type ActivityRow } from "@dowhat/shared";
import { buildSessionCloneQuery } from "@/lib/adminPrefill";
import { supabase } from "@/lib/supabase/browser";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

type Row = {
  id: string;
  activity_id: string | null;
  venue_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  price_cents: number | null;
  activities?: { name?: string | null; activity_types?: string[] | null } | null;
  venues?: { name?: string | null; address?: string | null; lat?: number | null; lng?: number | null } | null;
};

type EditableFields = {
  starts_at?: string;
  ends_at?: string;
  price_cents?: number | null;
};

export default function AdminSessions() {
  const searchParams = useSearchParams();
  const e2eBypass = useMemo(() => {
    const hasParam = searchParams?.get("e2e") === "1";
    const envEnabled = process.env.NEXT_PUBLIC_E2E_ADMIN_BYPASS === "true";
    const devMode = process.env.NODE_ENV !== "production";
    return hasParam && (envEnabled || devMode);
  }, [searchParams]);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, EditableFields>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    (async () => {
      let resolvedEmail: string | null = null;
      let allowListing = false;

      if (e2eBypass) {
        resolvedEmail = "playwright-admin@dowhat";
        allowListing = true;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        resolvedEmail = auth?.user?.email ?? null;
        const allow = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
          .split(/[ ,]+/)
          .filter(Boolean)
          .map((s) => s.toLowerCase());
        allowListing = resolvedEmail ? allow.includes(resolvedEmail.toLowerCase()) : false;
      }

      setEmail(resolvedEmail);
      setIsAdmin(allowListing);

      setLoading(true);
      const { data, error } = await supabase
        .from("sessions")
        .select(
          "id, activity_id, venue_id, starts_at, ends_at, price_cents, activities(name,activity_types), venues(name,address,lat,lng)",
        )
        .order("starts_at");
      if (error) setErr(error.message);
      else setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
  }, [e2eBypass]);

  async function save(id: string) {
    try {
      setErr(null);
      setMsg(null);
      const patch = editing[id];
      if (!patch) return;
      const payload: Record<string, unknown> = {};
      if (patch.starts_at) payload.starts_at = new Date(patch.starts_at).toISOString();
      if (patch.ends_at) payload.ends_at = new Date(patch.ends_at).toISOString();
      if (patch.price_cents != null) payload.price_cents = patch.price_cents;
      const { error } = await supabase.from("sessions").update(payload).eq("id", id);
      if (error) throw error;
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const next: Row = { ...r };
          if (patch.starts_at) next.starts_at = new Date(patch.starts_at).toISOString();
          if (patch.ends_at) next.ends_at = new Date(patch.ends_at).toISOString();
          if (patch.price_cents != null) next.price_cents = patch.price_cents;
          return next;
        })
      );
      setEditing((state) => ({ ...state, [id]: {} }));
      setMsg('Saved.');
    } catch (error: unknown) {
      setErr(getErrorMessage(error) || "Failed to save");
    }
  }

  async function del(id: string) {
    try {
      setErr(null);
      setMsg(null);
      await supabase.from("sessions").delete().eq("id", id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setMsg('Deleted.');
    } catch (error: unknown) {
      setErr(getErrorMessage(error) || "Failed to delete");
    }
  }

  if (isAdmin === false) {
    return (
      <main className="mx-auto max-w-5xl px-md py-xxl text-ink-strong">
        <div className="mb-md flex items-center gap-xs text-sm">
          <Link href="/" className="text-brand-teal">&larr; Back</Link>
          <h1 className="text-lg font-semibold text-ink-strong">Manage Sessions</h1>
        </div>
        <div className="rounded-xl border border-feedback-danger/30 bg-surface p-md text-sm text-feedback-danger shadow-card">
          <p className="font-medium">You don’t have access to this page.</p>
          <div className="mt-xs text-xs text-feedback-danger/80">Signed in as: {email ?? "(not signed in)"}</div>
        </div>
      </main>
    );
  }

  const normalizedQuery = searchTerm.trim().toLowerCase();
  const visibleRows = normalizedQuery
    ? rows.filter((row) => {
        const haystacks = [
          row.activities?.name,
          row.venues?.name,
          row.venues?.address,
          row.id,
          row.activity_id,
          row.venue_id,
        ];
        return haystacks.some((value) => typeof value === "string" && value.toLowerCase().includes(normalizedQuery));
      })
    : rows;

  const hasRows = rows.length > 0;
  const noRowsYet = !loading && !hasRows;
  const noMatches = !loading && hasRows && visibleRows.length === 0;

  return (
    <main className="mx-auto max-w-5xl px-md py-xxl text-ink-strong">
      <div className="mb-md flex items-center gap-xs text-sm">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-xl font-semibold text-ink-strong">Manage Sessions</h1>
      </div>
      <div className="mb-lg flex flex-col gap-sm rounded-xl border border-midnight-border bg-surface p-md shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-xxs">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by activity, venue, or id"
            className="w-full rounded-lg border border-midnight-border px-sm py-xs text-sm text-ink-strong focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
            aria-label="Search sessions"
          />
          <span className="text-xs text-ink-muted">
            Showing {visibleRows.length} of {rows.length} sessions
          </span>
        </div>
        <p className="text-xs text-ink-muted">Filter by host context before editing or deleting.</p>
      </div>
      {err ? (
        <div className="mb-sm rounded-xl border border-feedback-danger/30 bg-feedback-danger/5 px-sm py-xs text-sm text-feedback-danger">
          {err}
        </div>
      ) : null}
      {msg ? (
        <div className="mb-sm rounded-xl border border-feedback-success/30 bg-feedback-success/5 px-sm py-xs text-sm text-feedback-success">
          {msg}
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : noRowsYet ? (
        <div className="rounded-xl border border-dashed border-midnight-border/60 bg-surface p-xl text-center text-sm text-ink-muted">
          No sessions available yet.
        </div>
      ) : noMatches ? (
        <div className="rounded-xl border border-dashed border-midnight-border/60 bg-surface p-xl text-center text-sm text-ink-muted">
          No sessions match “{searchTerm.trim()}”.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-midnight-border bg-surface shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-left text-xs font-semibold uppercase text-ink-muted">
              <tr>
                <th className="p-sm">Activity</th>
                <th className="p-sm">Venue</th>
                <th className="p-sm">Starts</th>
                <th className="p-sm">Ends</th>
                <th className="p-sm">Price</th>
                <th className="p-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
            {visibleRows.map((r) => {
              const currentEdit = editing[r.id] || {};
              const startsDisplay = currentEdit.starts_at ?? r.starts_at?.slice(0,16) ?? "";
              const endsDisplay = currentEdit.ends_at ?? r.ends_at?.slice(0,16) ?? "";
              const priceDisplay = ((currentEdit.price_cents ?? r.price_cents ?? 0) / 100).toString();
              const sessionRow: ActivityRow = {
                id: r.id,
                price_cents: r.price_cents ?? null,
                starts_at: r.starts_at ?? null,
                ends_at: r.ends_at ?? null,
                activities: {
                  id: r.activity_id ?? undefined,
                  name: r.activities?.name ?? null,
                },
                venues: {
                  name: r.venues?.name ?? null,
                },
              };
              const basePayload = buildSessionSavePayload(sessionRow, { source: "admin_sessions" });
              const savePayload = basePayload
                ? {
                    ...basePayload,
                    venueId: r.venue_id ?? basePayload.venueId,
                    address: r.venues?.address ?? basePayload.address,
                    metadata: {
                      ...(basePayload.metadata ?? {}),
                      sessionId: r.id,
                      startsAt: r.starts_at,
                      endsAt: r.ends_at,
                      priceCents: r.price_cents,
                    },
                  }
                : null;
              const cloneQuery = buildSessionCloneQuery(
                {
                  activityId: r.activity_id,
                  activityName: r.activities?.name ?? null,
                  activityTypes: r.activities?.activity_types ?? null,
                  venueId: r.venue_id,
                  venueName: r.venues?.name ?? null,
                  venueAddress: r.venues?.address ?? null,
                  venueLat: r.venues?.lat ?? null,
                  venueLng: r.venues?.lng ?? null,
                  priceCents: r.price_cents ?? null,
                  startsAt: r.starts_at,
                  endsAt: r.ends_at,
                },
                { source: "admin_sessions_table" },
              );
              return (
                <tr key={r.id} className="border-t border-midnight-border/40">
                  <td className="p-sm text-ink-strong">{r.activities?.name ?? "Activity"}</td>
                  <td className="p-sm text-ink-medium">{r.venues?.name ?? "Venue"}</td>
                  <td className="p-sm">
                    <input
                      type="datetime-local"
                      value={startsDisplay}
                      onChange={(event) =>
                        setEditing((state) => ({
                          ...state,
                          [r.id]: { ...(state[r.id] || {}), starts_at: event.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-midnight-border px-xs py-xxs text-sm focus:border-brand-teal focus:outline-none"
                    />
                  </td>
                  <td className="p-sm">
                    <input
                      type="datetime-local"
                      value={endsDisplay}
                      onChange={(event) =>
                        setEditing((state) => ({
                          ...state,
                          [r.id]: { ...(state[r.id] || {}), ends_at: event.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-midnight-border px-xs py-xxs text-sm focus:border-brand-teal focus:outline-none"
                    />
                  </td>
                  <td className="p-sm">
                    <input
                      value={priceDisplay}
                      onChange={(event) =>
                        setEditing((state) => ({
                          ...state,
                          [r.id]: {
                            ...(state[r.id] || {}),
                            price_cents: Math.round((Number(event.target.value) || 0) * 100),
                          },
                        }))
                      }
                      className="w-24 rounded-lg border border-midnight-border px-xs py-xxs text-sm focus:border-brand-teal focus:outline-none"
                    />
                  </td>
                  <td className="p-sm">
                    <div className="flex flex-wrap items-center gap-xs">
                      {savePayload ? <SaveToggleButton size="sm" payload={savePayload} /> : null}
                      <Link
                        href={{ pathname: "/admin/new", query: cloneQuery }}
                        className="rounded-full border border-brand-teal/40 px-sm py-xxs text-xs font-semibold text-brand-teal hover:border-brand-teal"
                        aria-label={`Plan another session using ${r.activities?.name ?? "this activity"}`}
                      >
                        Plan another
                      </Link>
                      <button
                        onClick={() => save(r.id)}
                        className="rounded-full border border-midnight-border px-sm py-xxs text-xs font-semibold text-ink-strong hover:border-brand-teal"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => del(r.id)}
                        className="rounded-full border border-feedback-danger/40 px-sm py-xxs text-xs font-semibold text-feedback-danger hover:border-feedback-danger"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
