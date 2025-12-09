"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import SaveToggleButton from "@/components/SaveToggleButton";
import { buildPlaceSavePayload, type PlaceSummary } from "@dowhat/shared";
import { supabase } from "@/lib/supabase/browser";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

type Venue = { id: string; name: string; lat: number | null; lng: number | null };

export default function AdminVenues() {
  const searchParams = useSearchParams();
  const e2eBypass = useMemo(() => {
    return process.env.NEXT_PUBLIC_E2E_ADMIN_BYPASS === "true" && searchParams?.get("e2e") === "1";
  }, [searchParams]);
  const [rows, setRows] = useState<Venue[]>([]);
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
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
        .from("venues")
        .select("id,name,lat,lng")
        .order("name")
        .returns<Venue[]>();
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
      const payload: { name: string; lat?: number; lng?: number } = { name: n };
      const la = parseFloat(lat); const ln = parseFloat(lng);
      if (!Number.isNaN(la)) payload.lat = la;
      if (!Number.isNaN(ln)) payload.lng = ln;
      const { data, error } = await supabase
        .from("venues")
        .insert(payload)
        .select("id,name,lat,lng")
        .single<Venue>();
      if (error) throw error;
      setRows((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setName(""); setLat(""); setLng("");
      setMsg('Added.');
    } catch (error: unknown) {
      setErr(getErrorMessage(error) || "Failed to add");
    }
  }

  async function del(id: string) {
    try {
      setErr(null);
      setMsg(null);
      await supabase.from("venues").delete().eq("id", id);
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
          <h1 className="text-lg font-semibold">Manage Venues</h1>
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
        const latLabel = row.lat != null ? row.lat.toString() : "";
        const lngLabel = row.lng != null ? row.lng.toString() : "";
        const haystacks = [row.name, row.id, latLabel, lngLabel];
        return haystacks.some((value) => value && value.toLowerCase().includes(normalizedQuery));
      })
    : rows;
  const hasRows = rows.length > 0;
  const noRowsYet = !loading && !hasRows;
  const noMatches = !loading && hasRows && visibleRows.length === 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-lg font-semibold">Manage Venues</h1>
        <Link href="/admin/sessions" className="ml-auto text-brand-teal">Sessions</Link>
        <Link href="/admin/activities" className="text-brand-teal">Activities</Link>
      </div>
      {err && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-red-700">{err}</div>}
      {msg && <div className="mb-3 rounded bg-green-50 px-3 py-2 text-green-700">{msg}</div>}

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search venues by name, id, or coordinates"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-200"
            aria-label="Search venues"
          />
          <span className="text-xs text-gray-500">
            Showing {visibleRows.length} of {rows.length} venues
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New venue name"
            className="rounded border px-3 py-2"
          />
          <input
            value={lat}
            onChange={(event) => setLat(event.target.value)}
            placeholder="lat"
            inputMode="decimal"
            className="rounded border px-3 py-2"
          />
          <input
            value={lng}
            onChange={(event) => setLng(event.target.value)}
            placeholder="lng"
            inputMode="decimal"
            className="rounded border px-3 py-2"
          />
          <button onClick={add} className="rounded bg-brand-teal px-3 py-2 text-white">Add</button>
        </div>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : noRowsYet ? (
        <div className="rounded border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
          No venues have been added yet.
        </div>
      ) : noMatches ? (
        <div className="rounded border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
          No venues match “{searchTerm.trim()}”.
        </div>
      ) : (
        <ul className="divide-y rounded border">
          {visibleRows.map((r) => (
            <li key={r.id} className="flex items-center justify-between p-3">
              <span>{r.name}{r.lat != null && r.lng != null ? ` (${r.lat}, ${r.lng})` : ""}</span>
              <div className="flex items-center gap-2">
                <SaveToggleButton
                  size="sm"
                  payload={(() => {
                    const summary: PlaceSummary = {
                      id: r.id,
                      slug: null,
                      name: r.name,
                      lat: r.lat ?? 0,
                      lng: r.lng ?? 0,
                      categories: [],
                      tags: [],
                      aggregatedFrom: [],
                      attributions: [],
                      address: null,
                      city: null,
                      locality: null,
                      region: null,
                      country: null,
                      postcode: null,
                      phone: null,
                      website: null,
                      description: null,
                      fsqId: null,
                      rating: null,
                      ratingCount: null,
                      priceLevel: null,
                      popularityScore: null,
                      primarySource: null,
                      cacheExpiresAt: undefined,
                      cachedAt: undefined,
                      metadata: null,
                      transient: true,
                    };
                    const payload = buildPlaceSavePayload(summary, null);
                    return {
                      ...payload,
                      metadata: {
                        ...(payload.metadata ?? {}),
                        source: "admin_venues",
                        lat: r.lat,
                        lng: r.lng,
                      },
                    };
                  })()}
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
