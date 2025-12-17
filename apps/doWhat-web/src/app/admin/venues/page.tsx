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
    const hasParam = searchParams?.get("e2e") === "1";
    const envEnabled = process.env.NEXT_PUBLIC_E2E_ADMIN_BYPASS === "true";
    const devMode = process.env.NODE_ENV !== "production";
    return hasParam && (envEnabled || devMode);
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
      <main className="mx-auto max-w-4xl px-md py-xxl text-ink-strong">
        <div className="mb-md flex items-center gap-xs text-sm">
          <Link href="/" className="text-brand-teal">&larr; Back</Link>
          <h1 className="text-lg font-semibold text-ink-strong">Manage Venues</h1>
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
    <main className="mx-auto max-w-4xl px-md py-xxl text-ink-strong">
      <div className="mb-md flex flex-wrap items-center gap-xs text-sm">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-xl font-semibold text-ink-strong">Manage Venues</h1>
        <div className="ml-auto flex items-center gap-sm text-xs font-semibold">
          <Link href="/admin/sessions" className="text-brand-teal">Sessions</Link>
          <Link href="/admin/activities" className="text-brand-teal">Activities</Link>
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
            placeholder="Search venues by name, id, or coordinates"
            className="w-full rounded-lg border border-midnight-border px-sm py-xs text-sm text-ink-strong focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
            aria-label="Search venues"
          />
          <span className="text-xs text-ink-muted">
            Showing {visibleRows.length} of {rows.length} venues
          </span>
        </div>

        <div className="grid grid-cols-1 gap-xs sm:grid-cols-[1fr_minmax(0,120px)_minmax(0,120px)_auto]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New venue name"
            className="rounded-lg border border-midnight-border px-sm py-xs text-sm focus:border-brand-teal focus:outline-none"
          />
          <input
            value={lat}
            onChange={(event) => setLat(event.target.value)}
            placeholder="lat"
            inputMode="decimal"
            className="rounded-lg border border-midnight-border px-sm py-xs text-sm focus:border-brand-teal focus:outline-none"
          />
          <input
            value={lng}
            onChange={(event) => setLng(event.target.value)}
            placeholder="lng"
            inputMode="decimal"
            className="rounded-lg border border-midnight-border px-sm py-xs text-sm focus:border-brand-teal focus:outline-none"
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
          No venues have been added yet.
        </div>
      ) : noMatches ? (
        <div className="rounded-xl border border-dashed border-midnight-border/60 bg-surface p-xl text-center text-sm text-ink-muted">
          No venues match “{searchTerm.trim()}”.
        </div>
      ) : (
        <ul className="divide-y divide-midnight-border/30 rounded-xl border border-midnight-border bg-surface shadow-card">
          {visibleRows.map((r) => (
            <li key={r.id} className="flex flex-col gap-sm p-md text-sm text-ink-strong sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{r.name}</p>
                {r.lat != null && r.lng != null ? (
                  <p className="text-xs text-ink-muted">{r.lat}, {r.lng}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-xs">
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
