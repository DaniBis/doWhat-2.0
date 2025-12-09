"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import SaveToggleButton from "@/components/SaveToggleButton";
import { buildActivitySavePayload } from "@dowhat/shared";
import { supabase } from "@/lib/supabase/browser";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

type Activity = { id: string; name: string };

export default function AdminActivities() {
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
      const { data: auth } = await supabase.auth.getUser();
      const em = auth?.user?.email ?? null;
      setEmail(em);
      const allow = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
        .split(/[ ,]+/)
        .filter(Boolean)
        .map((s) => s.toLowerCase());
      setIsAdmin(em ? allow.includes(em.toLowerCase()) : false);

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
  }, []);

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
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-3 flex items-center gap-2">
          <Link href="/" className="text-brand-teal">&larr; Back</Link>
          <h1 className="text-lg font-semibold">Manage Activities</h1>
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
        const haystack = `${row.name} ${row.id}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : rows;
  const hasRows = rows.length > 0;
  const noRowsYet = !loading && !hasRows;
  const noMatches = !loading && hasRows && visibleRows.length === 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-lg font-semibold">Manage Activities</h1>
        <Link href="/admin/sessions" className="ml-auto text-brand-teal">Sessions</Link>
        <Link href="/admin/venues" className="text-brand-teal">Venues</Link>
      </div>
      {err && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-red-700">{err}</div>}
      {msg && <div className="mb-3 rounded bg-green-50 px-3 py-2 text-green-700">{msg}</div>}

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search activities by name or id"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-200"
            aria-label="Search activities"
          />
          <span className="text-xs text-gray-500">
            Showing {visibleRows.length} of {rows.length} activities
          </span>
        </div>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New activity name"
            className="flex-1 rounded border px-3 py-2"
          />
          <button onClick={add} className="rounded bg-brand-teal px-3 py-2 text-white">Add</button>
        </div>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : noRowsYet ? (
        <div className="rounded border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
          No activities have been created yet.
        </div>
      ) : noMatches ? (
        <div className="rounded border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
          No activities match “{searchTerm.trim()}”.
        </div>
      ) : (
        <ul className="divide-y rounded border">
          {visibleRows.map((r) => (
            <li key={r.id} className="flex items-center justify-between p-3">
              <span>{r.name}</span>
              <div className="flex items-center gap-2">
                <SaveToggleButton
                  size="sm"
                  payload={buildActivitySavePayload(
                    { id: r.id, name: r.name },
                    [],
                    { source: "admin_activities" },
                  )}
                />
                <button onClick={() => del(r.id)} className="rounded border border-red-300 px-2 py-1 text-red-700">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
