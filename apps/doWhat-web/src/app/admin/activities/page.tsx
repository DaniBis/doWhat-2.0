"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import SaveToggleButton from "@/components/SaveToggleButton";
import { buildActivitySavePayload } from "@dowhat/shared";
import { supabase } from "@/lib/supabase/browser";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

type Activity = { id: string; name: string };

export default function AdminActivities() {
  const searchParams = useSearchParams();
  const e2eBypass = useMemo(() => {
    const hasParam = searchParams?.get("e2e") === "1";
    const envEnabled = process.env.NEXT_PUBLIC_E2E_ADMIN_BYPASS === "true";
    const devMode = process.env.NODE_ENV !== "production";
    return hasParam && (envEnabled || devMode);
  }, [searchParams]);
  const [rows, setRows] = useState<Activity[]>([]);
  const [name, setName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
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
        .from("activities")
        .select("id,name")
        .order("name")
        .returns<Activity[]>();
      if (error) setErr(error.message);
      else setRows(data ?? []);
      setLoading(false);
    })();
  }, [e2eBypass]);

  async function add() {
    try {
      setErr(null);
      setMsg(null);
      const n = name.trim();
      if (!n) return;
      const { data, error } = await supabase
        .from("activities")
        .insert({ name: n })
        .select("id,name")
        .single<Activity>();
      if (error) throw error;
      setRows((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setMsg('Added.');
    } catch (error: unknown) {
      setErr(getErrorMessage(error) || "Failed to add");
    }
  }

  async function del(id: string) {
    try {
      setErr(null);
      setMsg(null);
      await supabase.from("activities").delete().eq("id", id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setMsg('Deleted.');
    } catch (error: unknown) {
      setErr(getErrorMessage(error) || "Failed to delete");
    }
  }

  if (isAdmin === false) {
    return (
      <main className="mx-auto max-w-4xl px-md py-xxl text-ink-strong">
        <div className="mb-md flex items-center gap-xs text-sm">
          <Link href="/" className="text-brand-teal">&larr; Back</Link>
          <h1 className="text-lg font-semibold text-ink-strong">Manage Activities</h1>
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
        const haystack = `${row.name} ${row.id}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : rows;
  const hasRows = rows.length > 0;
  const noRowsYet = !loading && !hasRows;
  const noMatches = !loading && hasRows && visibleRows.length === 0;

  return (
    <main className="mx-auto max-w-4xl px-md py-xxl text-ink-strong">
      <div className="mb-md flex flex-wrap items-center gap-xs text-sm">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-xl font-semibold text-ink-strong">Manage Activities</h1>
        <div className="ml-auto flex items-center gap-sm text-xs font-semibold">
          <Link href="/admin/sessions" className="text-brand-teal">Sessions</Link>
          <Link href="/admin/venues" className="text-brand-teal">Venues</Link>
        </div>
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

      <div className="mb-lg space-y-sm rounded-xl border border-midnight-border bg-surface p-md shadow-card">
        <div className="flex flex-col gap-xxs sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search activities by name or id"
            className="w-full rounded-lg border border-midnight-border px-sm py-xs text-sm text-ink-strong focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
            aria-label="Search activities"
          />
          <span className="text-xs text-ink-muted">
            Showing {visibleRows.length} of {rows.length} activities
          </span>
        </div>
        <div className="flex flex-col gap-xs sm:flex-row">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New activity name"
            className="flex-1 rounded-lg border border-midnight-border px-sm py-xs text-sm focus:border-brand-teal focus:outline-none"
          />
          <button
            onClick={add}
            className="rounded-full bg-brand-teal px-md py-xs text-sm font-semibold text-white shadow-card hover:bg-brand-dark"
          >
            Add
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : noRowsYet ? (
        <div className="rounded-xl border border-dashed border-midnight-border/60 bg-surface p-xl text-center text-sm text-ink-muted">
          No activities have been created yet.
        </div>
      ) : noMatches ? (
        <div className="rounded-xl border border-dashed border-midnight-border/60 bg-surface p-xl text-center text-sm text-ink-muted">
          No activities match “{searchTerm.trim()}”.
        </div>
      ) : (
        <ul className="divide-y divide-midnight-border/30 rounded-xl border border-midnight-border bg-surface shadow-card">
          {visibleRows.map((r) => (
            <li key={r.id} className="flex flex-col gap-sm p-md text-sm text-ink-strong sm:flex-row sm:items-center sm:justify-between">
              <span className="font-semibold">{r.name}</span>
              <div className="flex items-center gap-xs">
                <SaveToggleButton
                  size="sm"
                  payload={buildActivitySavePayload(
                    { id: r.id, name: r.name },
                    [],
                    { source: "admin_activities" },
                  )}
                />
                <button
                  onClick={() => del(r.id)}
                  className="rounded-full border border-feedback-danger/40 px-sm py-xxs text-xs font-semibold text-feedback-danger hover:border-feedback-danger"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
