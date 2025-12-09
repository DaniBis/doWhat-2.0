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
    return process.env.NEXT_PUBLIC_E2E_ADMIN_BYPASS === "true" && searchParams?.get("e2e") === "1";
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
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-3 flex items-center gap-2">
          <Link href="/" className="text-brand-teal">&larr; Back</Link>
          <h1 className="text-lg font-semibold">Manage Sessions</h1>
        </div>
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
          You don’t have access to this page.
          <div className="mt-2 text-sm text-red-600">Signed in as: {email ?? "(not signed in)"}</div>
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
    <main className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-lg font-semibold">Manage Sessions</h1>
      </div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by activity, venue, or id"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-200"
            aria-label="Search sessions"
          />
          <span className="text-xs text-gray-500">
            Showing {visibleRows.length} of {rows.length} sessions
          </span>
        </div>
        <p className="text-xs text-gray-500">
          Filter by host context before editing or deleting.
        </p>
      </div>
      {err && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-red-700">{err}</div>}
      {msg && <div className="mb-3 rounded bg-green-50 px-3 py-2 text-green-700">{msg}</div>}
      {loading ? (
        <p>Loading…</p>
      ) : noRowsYet ? (
        <div className="rounded border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
          No sessions available yet.
        </div>
      ) : noMatches ? (
        <div className="rounded border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
          No sessions match “{searchTerm.trim()}”.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600">
              <th className="p-2">Activity</th>
              <th className="p-2">Venue</th>
              <th className="p-2">Starts</th>
              <th className="p-2">Ends</th>
              <th className="p-2">Price</th>
              <th className="p-2">Actions</th>
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
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.activities?.name ?? "Activity"}</td>
                  <td className="p-2">{r.venues?.name ?? "Venue"}</td>
                  <td className="p-2">
                    <input
                      type="datetime-local"
                      value={startsDisplay}
                      onChange={(event) =>
                        setEditing((state) => ({
                          ...state,
                          [r.id]: { ...(state[r.id] || {}), starts_at: event.target.value },
                        }))
                      }
                      className="rounded border px-2 py-1"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="datetime-local"
                      value={endsDisplay}
                      onChange={(event) =>
                        setEditing((state) => ({
                          ...state,
                          [r.id]: { ...(state[r.id] || {}), ends_at: event.target.value },
                        }))
                      }
                      className="rounded border px-2 py-1"
                    />
                  </td>
                  <td className="p-2">
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
                      className="w-24 rounded border px-2 py-1"
                    />
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {savePayload ? <SaveToggleButton size="sm" payload={savePayload} /> : null}
                      <Link
                        href={{ pathname: "/admin/new", query: cloneQuery }}
                        className="rounded border border-emerald-300 px-2 py-1 text-xs font-semibold text-emerald-700 hover:border-emerald-400"
                        aria-label={`Plan another session using ${r.activities?.name ?? "this activity"}`}
                      >
                        Plan another
                      </Link>
                      <button onClick={() => save(r.id)} className="rounded border px-2 py-1">Save</button>
                      <button onClick={() => del(r.id)} className="rounded border border-red-300 px-2 py-1 text-red-700">Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
