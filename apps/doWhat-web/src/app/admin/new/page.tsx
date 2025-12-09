"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

import TaxonomyCategoryPicker from "@/components/TaxonomyCategoryPicker";
import {
  activityTaxonomy,
  defaultTier3Index,
  type ActivityTier3WithAncestors,
} from "@dowhat/shared";
import { normaliseCategoryIds } from "@/lib/adminPrefill";
import { supabase } from "@/lib/supabase/browser";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

type ActivityOption = {
  id: string;
  name: string;
  activity_types?: string[] | null;
};

type VenueOption = { id: string; name: string };

type PrefillState = {
  activityId: string | null;
  activityName: string | null;
  venueId: string | null;
  venueName: string | null;
  venueAddress: string | null;
  lat: string | null;
  lng: string | null;
  price: string | null;
  startsAt: string | null;
  endsAt: string | null;
  categoryId: string | null;
  categoryIds: string[];
  source: string | null;
};

const sanitizeQueryValue = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normaliseCoordinateParam = (value: string | null): string | null => {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric.toFixed(6);
};

const normaliseDateParam = (value: string | null): string | null => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 16);
};

const splitCategoryIdsParam = (value: string | null): string[] => {
  if (!value) return [];
  return value
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean);
};

export default function AdminNewSessionPage() {
  const searchParams = useSearchParams();
  const e2eBypass = useMemo(() => {
    return process.env.NEXT_PUBLIC_E2E_ADMIN_BYPASS === "true" && searchParams?.get("e2e") === "1";
  }, [searchParams]);
  const prefill = useMemo<PrefillState>(() => {
    if (!searchParams) {
      return {
        activityId: null,
        activityName: null,
        venueId: null,
        venueName: null,
        venueAddress: null,
        lat: null,
        lng: null,
        price: null,
        startsAt: null,
        endsAt: null,
        categoryId: null,
        categoryIds: [],
        source: null,
      } satisfies PrefillState;
    }
    const csvCategories = splitCategoryIdsParam(searchParams.get("categoryIds"));
    const repeatedCategories = searchParams
      .getAll("categoryId")
      .map((value) => sanitizeQueryValue(value))
      .filter((value): value is string => Boolean(value));
    const categoryIds = normaliseCategoryIds([...csvCategories, ...repeatedCategories]);
    return {
      activityId: sanitizeQueryValue(searchParams.get("activityId")),
      activityName: sanitizeQueryValue(searchParams.get("activityName")),
      venueId: sanitizeQueryValue(searchParams.get("venueId")),
      venueName: sanitizeQueryValue(searchParams.get("venueName")),
      venueAddress: sanitizeQueryValue(searchParams.get("venueAddress")),
      lat: normaliseCoordinateParam(searchParams.get("lat")),
      lng: normaliseCoordinateParam(searchParams.get("lng")),
      price: sanitizeQueryValue(searchParams.get("price")),
      startsAt: normaliseDateParam(searchParams.get("startsAt")),
      endsAt: normaliseDateParam(searchParams.get("endsAt")),
      categoryId: categoryIds[0] ?? null,
      categoryIds,
      source: sanitizeQueryValue(searchParams.get("source")),
    } satisfies PrefillState;
  }, [searchParams]);

  const defaultSchedule = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startValue = tomorrow.toISOString().slice(0, 16);
    const endValue = new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16);
    return { startValue, endValue };
  }, []);

  const hasPrefillNotice = Boolean(
    prefill.activityId ||
      prefill.activityName ||
      prefill.venueId ||
      prefill.venueName ||
      prefill.venueAddress ||
      prefill.lat ||
      prefill.lng ||
      prefill.categoryId ||
      prefill.categoryIds.length ||
      prefill.source,
  );
  // Basic admin gate: allow if email appears in NEXT_PUBLIC_ADMIN_EMAILS (comma-separated)
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [activities, setActivities] = useState<ActivityOption[]>([]);
  const [venues, setVenues] = useState<VenueOption[]>([]);

  const [activityId, setActivityId] = useState<string>(prefill.activityId ?? "");
  const [activityName, setActivityName] = useState<string>(prefill.activityName ?? "");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    if (prefill.categoryIds.length) return prefill.categoryIds;
    return prefill.categoryId ? [prefill.categoryId] : [];
  });

  const [venueId, setVenueId] = useState<string>(prefill.venueId ?? "");
  const [venueName, setVenueName] = useState<string>(prefill.venueName ?? "");
  const [venueLat, setVenueLat] = useState<string>(prefill.lat ?? "");
  const [venueLng, setVenueLng] = useState<string>(prefill.lng ?? "");

  const [price, setPrice] = useState<string>(prefill.price ?? "");
  const [startsAt, setStartsAt] = useState<string>(prefill.startsAt ?? defaultSchedule.startValue);
  const [endsAt, setEndsAt] = useState<string>(prefill.endsAt ?? defaultSchedule.endValue);

  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const handleResetPrefills = useCallback(() => {
    setActivityId("");
    setActivityName("");
    setSelectedCategories([]);
    setVenueId("");
    setVenueName("");
    setVenueLat("");
    setVenueLng("");
    setPrice("");
    setStartsAt(defaultSchedule.startValue);
    setEndsAt(defaultSchedule.endValue);
  }, [defaultSchedule.endValue, defaultSchedule.startValue]);

  const tier3Lookup = useMemo(() => {
    const map = new Map<string, ActivityTier3WithAncestors>();
    defaultTier3Index.forEach((entry) => {
      map.set(entry.id, entry);
    });
    return map;
  }, []);

  const prefilledCategoryMetas = useMemo(() => {
    const ids = prefill.categoryIds.length
      ? prefill.categoryIds
      : prefill.categoryId
        ? [prefill.categoryId]
        : [];
    return ids.map((id) => {
      const entry = tier3Lookup.get(id);
      return {
        id,
        label: entry?.label ?? id,
        parent: entry?.tier1Label ?? entry?.tier2Label ?? null,
      };
    });
  }, [prefill.categoryIds, prefill.categoryId, tier3Lookup]);

  const prefilledCategorySummaryList = useMemo(() => {
    if (!prefilledCategoryMetas.length) return [] as string[];
    return prefilledCategoryMetas.map((meta) =>
      meta.parent ? `${meta.label} • ${meta.parent}` : meta.label,
    );
  }, [prefilledCategoryMetas]);

  const prefillSummary = useMemo(() => {
    if (!hasPrefillNotice) return [] as { label: string; value: string }[];
    const items: { label: string; value: string }[] = [];
    if (prefill.activityName || prefill.activityId) {
      const parts: string[] = [];
      if (prefill.activityName) parts.push(prefill.activityName);
      if (prefill.activityId) parts.push(`ID ${prefill.activityId}`);
      items.push({ label: "Activity", value: parts.join(" • ") });
    }
    if (prefill.venueName || prefill.venueAddress || prefill.venueId) {
      const parts: string[] = [];
      if (prefill.venueName) parts.push(prefill.venueName);
      if (prefill.venueAddress) parts.push(prefill.venueAddress);
      if (prefill.venueId) parts.push(`ID ${prefill.venueId}`);
      items.push({ label: "Venue", value: parts.join(" • ") });
    }
    if (prefill.lat || prefill.lng) {
      const latValue = prefill.lat ?? "—";
      const lngValue = prefill.lng ?? "—";
      items.push({ label: "Coordinates", value: `${latValue}, ${lngValue}` });
    }
    if (prefilledCategorySummaryList.length) {
      items.push({ label: "Taxonomy", value: prefilledCategorySummaryList.join(" / ") });
    }
    if (prefill.price) {
      items.push({ label: "Price", value: prefill.price });
    }
    if (prefill.startsAt || prefill.endsAt) {
      const start = prefill.startsAt ? new Date(prefill.startsAt).toLocaleString() : "—";
      const end = prefill.endsAt ? new Date(prefill.endsAt).toLocaleString() : "—";
      items.push({ label: "Schedule", value: `${start} → ${end}` });
    }
    return items;
  }, [hasPrefillNotice, prefill, prefilledCategorySummaryList]);

  const prefillSourceLabel = useMemo(() => {
    if (!prefill.source) return null;
    const friendly: Record<string, string> = {
      venue_verification_list: "Venue verification list",
      venue_verification_detail: "Venue verification detail",
      venue_verification: "Venue verification",
      admin_dashboard_session: "Admin dashboard session",
    };
    if (friendly[prefill.source]) {
      return friendly[prefill.source];
    }
    return prefill.source
      .split(/[_\s]+/)
      .map((chunk) => (chunk ? chunk[0].toUpperCase() + chunk.slice(1) : ""))
      .filter(Boolean)
      .join(" ");
  }, [prefill.source]);

  useEffect(() => {
    (async () => {
      let email: string | null = null;
      let allowListing = false;

      if (e2eBypass) {
        email = "playwright-admin@dowhat";
        allowListing = true;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        email = auth?.user?.email ?? null;
        const allow = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
          .split(/[\,\s]+/)
          .filter(Boolean)
          .map((s) => s.toLowerCase());
        allowListing = email ? allow.includes(email.toLowerCase()) : false;
      }

      setUserEmail(email);
      setIsAdmin(allowListing);

      type ActivityRow = { id: string; name: string | null; activity_types?: string[] | null };
      type VenueRow = { id: string; name: string | null };

      const a = await supabase
        .from("activities")
        .select("id,name,activity_types")
        .order("name")
        .returns<ActivityRow[]>();
      if (!a.error && a.data) {
        setActivities(
          a.data.map((row) => ({
            id: row.id,
            name: row.name ?? "Untitled activity",
            activity_types: row.activity_types ?? null,
          })),
        );
      }
      const v = await supabase
        .from("venues")
        .select("id,name")
        .order("name")
        .returns<VenueRow[]>();
      if (!v.error && v.data) {
        setVenues(v.data.map((row) => ({ id: row.id, name: row.name ?? "Untitled venue" })));
      }
    })();
  }, [e2eBypass]);

  const prefillWarnings = useMemo(() => {
    if (!hasPrefillNotice) return [] as string[];
    const warnings: string[] = [];
    const hasVenuePrefill = Boolean(
      prefill.venueId ||
        prefill.venueName ||
        prefill.venueAddress ||
        prefill.lat ||
        prefill.lng,
    );
    const hasFullCoordinates = Boolean(prefill.lat && prefill.lng);
    const hasPartialCoordinates = Boolean((prefill.lat && !prefill.lng) || (!prefill.lat && prefill.lng));
    if (hasVenuePrefill) {
      if (!prefill.venueAddress) {
        warnings.push("The prefill did not include a venue address — confirm the location before publishing.");
      }
      if (!hasFullCoordinates) {
        warnings.push(
          hasPartialCoordinates
            ? "The prefill only supplied one coordinate value — add both latitude and longitude."
            : "The prefill did not include coordinates — add latitude and longitude before publishing.",
        );
      }
    }
    return warnings;
  }, [hasPrefillNotice, prefill]);


  const chosenActivityName = useMemo(() => {
    if (activityId) return activities.find((x) => x.id === activityId)?.name ?? "";
    return activityName;
  }, [activityId, activityName, activities]);

  const chosenVenueName = useMemo(() => {
    if (venueId) return venues.find((x) => x.id === venueId)?.name ?? "";
    return venueName;
  }, [venueId, venueName, venues]);

  const sanitizedCategoryIds = useMemo(() => {
    return Array.from(new Set(selectedCategories.filter(Boolean)));
  }, [selectedCategories]);

  const selectedCategoryLabels = useMemo(
    () =>
      selectedCategories.map((id) => {
        const entry = tier3Lookup.get(id);
        return {
          id,
          label: entry?.label ?? id,
          parent: entry?.tier1Label ?? entry?.tier2Label ?? null,
        };
      }),
    [selectedCategories, tier3Lookup],
  );

  useEffect(() => {
    const incoming = prefill.categoryIds.length
      ? prefill.categoryIds
      : prefill.categoryId
        ? [prefill.categoryId]
        : [];
    if (!incoming.length) return;
    setSelectedCategories((prev) => (prev.length ? prev : incoming));
  }, [prefill.categoryIds, prefill.categoryId]);

  useEffect(() => {
    if (!activityId) return;
    const match = activities.find((item) => item.id === activityId);
    if (match) {
      setSelectedCategories(match.activity_types ?? []);
    }
  }, [activityId, activities]);

  const latProvided = venueLat.trim().length > 0;
  const lngProvided = venueLng.trim().length > 0;
  const latNumeric = Number(venueLat);
  const lngNumeric = Number(venueLng);
  const latInvalid = latProvided && Number.isNaN(latNumeric);
  const lngInvalid = lngProvided && Number.isNaN(lngNumeric);
  const latOutOfRange = latProvided && !latInvalid && (latNumeric < -90 || latNumeric > 90);
  const lngOutOfRange = lngProvided && !lngInvalid && (lngNumeric < -180 || lngNumeric > 180);
  const coordinateMismatch = (latProvided && !lngProvided) || (!latProvided && lngProvided);

  const handleToggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  };

  async function ensureActivity(): Promise<{ id: string; created: boolean }> {
    if (activityId) {
      return { id: activityId, created: false };
    }
    const name = activityName.trim();
    if (!name) throw new Error("Enter activity name or select one.");
    const payload: Record<string, unknown> = { name };
    if (sanitizedCategoryIds.length) {
      payload.activity_types = sanitizedCategoryIds;
    }
    const { data, error } = await supabase
      .from("activities")
      .insert(payload)
      .select("id")
      .single<{ id: string }>();
    if (error) throw error;
    setActivities((prev) =>
      [...prev, { id: data.id, name, activity_types: sanitizedCategoryIds.length ? sanitizedCategoryIds : null }].sort(
        (a, b) => a.name.localeCompare(b.name),
      ),
    );
    setActivityId(data.id);
    setActivityName("");
    return { id: data.id, created: true };
  }

  async function syncActivityCategories(activityRecordId: string, created: boolean) {
    if (created) return;
    const payload = sanitizedCategoryIds.length ? sanitizedCategoryIds : null;
    const { error } = await supabase
      .from("activities")
      .update({ activity_types: payload })
      .eq("id", activityRecordId);
    if (error) throw error;
    setActivities((prev) =>
      prev.map((row) => (row.id === activityRecordId ? { ...row, activity_types: payload } : row)),
    );
  }

  async function ensureVenue(): Promise<string> {
    if (venueId) return venueId;
    const name = venueName.trim();
    if (!name) throw new Error("Enter venue name or select one.");
    const lat = venueLat ? Number(venueLat) : null;
    const lng = venueLng ? Number(venueLng) : null;
    const payload: Record<string, unknown> = { name };
    if (!Number.isNaN(lat)) payload.lat = lat;
    if (!Number.isNaN(lng)) payload.lng = lng;
    const { data, error } = await supabase
      .from("venues")
      .insert(payload)
      .select("id")
      .single<{ id: string }>();
    if (error) throw error;
    return data.id;
  }

  async function onCreate() {
    try {
      setErr("");
      setMsg("");
      setSubmitting(true);
      if (!isAdmin) throw new Error("You are not allowed to create sessions.");

      const { id: actId, created: activityCreated } = await ensureActivity();
      const venId = await ensureVenue();
      await syncActivityCategories(actId, activityCreated);

      const cents = Math.round((Number(price) || 0) * 100);
      if (!startsAt || !endsAt) throw new Error("Start and end time are required.");
      const starts = new Date(startsAt).toISOString();
      const ends = new Date(endsAt).toISOString();
      if (isNaN(+new Date(starts)) || isNaN(+new Date(ends))) {
        throw new Error("Invalid date/time values.");
      }
      if (+new Date(ends) <= +new Date(starts)) {
        throw new Error("End time must be after start time.");
      }

      const { data, error } = await supabase
        .from("sessions")
        .insert({ activity_id: actId, venue_id: venId, price_cents: cents, starts_at: starts, ends_at: ends })
        .select("id")
        .single<{ id: string }>();
      if (error) throw error;

      setMsg("Session created. Redirecting…");
      const id = data.id;
      // Navigate to the new session page
      window.location.href = `/sessions/${id}`;
    } catch (error: unknown) {
      setErr(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (isAdmin === false) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-3 flex items-center gap-2">
          <Link href="/" className="text-brand-teal">&larr; Back</Link>
          <h1 className="text-lg font-semibold">Create Session</h1>
        </div>
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
          You don’t have access to this page. Ask an admin to add your email to NEXT_PUBLIC_ADMIN_EMAILS.
          <div className="mt-2 text-sm text-red-600">Signed in as: {userEmail ?? "(not signed in)"}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-lg font-semibold">Create Session</h1>
      </div>

      {hasPrefillNotice ? (
        <div
          className="mb-3 rounded border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          role="status"
          aria-live="polite"
        >
          <p className="font-semibold">
            Prefilled {prefillSourceLabel ? `via ${prefillSourceLabel}` : "from query parameters"}.
          </p>
          <p className="text-xs text-emerald-900">Confirm taxonomy tags and coordinates before publishing.</p>
          {prefilledCategorySummaryList.length ? (
            <p className="mt-1 text-xs text-emerald-900">
              Taxonomy preset: <span className="font-semibold">{prefilledCategorySummaryList.join(", ")}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {prefillSummary.length ? (
        <div className="mb-4 rounded-2xl border border-emerald-100 bg-white/80 p-4 text-sm text-slate-700">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Prefill summary</p>
            <button
              type="button"
              onClick={handleResetPrefills}
              className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 hover:border-emerald-300"
              aria-label="Clear all prefilled values"
            >
              Clear prefills
            </button>
          </div>
          <ul className="space-y-1">
            {prefillSummary.map((item) => (
              <li key={item.label} className="flex items-start gap-2">
                <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {item.label}
                </span>
                <span className="flex-1 text-sm text-slate-800">{item.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {prefillWarnings.length ? (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status" aria-live="polite">
          <p className="font-semibold">Check venue details before publishing</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-amber-900">
            {prefillWarnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {err && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-red-700">{err}</div>}
      {msg && <div className="mb-3 rounded bg-green-50 px-3 py-2 text-green-700">{msg}</div>}

      <section className="grid gap-4">
        <div className="rounded border p-4">
          <h2 className="font-semibold">Activity</h2>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">Select existing</label>
              <select
                value={activityId}
                onChange={(e) => {
                  const value = e.target.value;
                  setActivityId(value);
                  if (value) {
                    setActivityName("");
                    const match = activities.find((item) => item.id === value);
                    setSelectedCategories(match?.activity_types ?? []);
                  } else {
                    setSelectedCategories([]);
                  }
                }}
                className="w-full rounded border px-3 py-2"
              >
                <option value="">-- none --</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm">Or new name</label>
              <input
                value={activityName}
                onChange={(e) => {
                  setActivityName(e.target.value);
                  if (e.target.value) {
                    setActivityId("");
                    setSelectedCategories([]);
                  }
                }}
                placeholder="e.g. Running"
                className="w-full rounded border px-3 py-2"
              />
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500">Chosen: {chosenActivityName || "—"}</p>
          {!activityId && !activityName && (
            <p className="mt-1 text-xs text-red-600">Select an activity or type a new one.</p>
          )}
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Activity categories</h3>
                <p className="text-sm text-gray-500">Tag the activity with tier 3 taxonomy entries so admin tools stay in sync with discovery filters.</p>
              </div>
              <span className="text-xs text-gray-500">{sanitizedCategoryIds.length} selected</span>
            </div>
            <TaxonomyCategoryPicker
              selectedIds={selectedCategories}
              onToggle={handleToggleCategory}
              taxonomy={activityTaxonomy}
              className="mt-4"
            />
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
              {selectedCategoryLabels.length ? (
                selectedCategoryLabels.map((item) => (
                  <span
                    key={item.id}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800"
                  >
                    {item.label}
                    {item.parent ? ` • ${item.parent}` : ""}
                  </span>
                ))
              ) : (
                <span className="text-gray-500">No categories selected yet.</span>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500">Selected categories are saved back to the activity so hosts and discovery filters stay aligned.</p>
          </div>
        </div>

        <div className="rounded border p-4">
          <h2 className="font-semibold">Venue</h2>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">Select existing</label>
              <select value={venueId} onChange={(e) => setVenueId(e.target.value)} className="w-full rounded border px-3 py-2">
                <option value="">-- none --</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm">Or new name</label>
              <input value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="e.g. City Park" className="w-full rounded border px-3 py-2" />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">Latitude (optional)</label>
              <input value={venueLat} onChange={(e) => setVenueLat(e.target.value)} inputMode="decimal" placeholder="51.5074" className="w-full rounded border px-3 py-2" />
              {latInvalid ? (
                <p className="mt-1 text-xs text-red-600">Enter a numeric latitude between -90 and 90.</p>
              ) : null}
              {!latInvalid && latOutOfRange ? (
                <p className="mt-1 text-xs text-red-600">Latitude must be between -90° and 90°.</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm">Longitude (optional)</label>
              <input value={venueLng} onChange={(e) => setVenueLng(e.target.value)} inputMode="decimal" placeholder="-0.1278" className="w-full rounded border px-3 py-2" />
              {lngInvalid ? (
                <p className="mt-1 text-xs text-red-600">Enter a numeric longitude between -180 and 180.</p>
              ) : null}
              {!lngInvalid && lngOutOfRange ? (
                <p className="mt-1 text-xs text-red-600">Longitude must be between -180° and 180°.</p>
              ) : null}
            </div>
          </div>
          {coordinateMismatch ? (
            <p className="mt-1 text-xs text-amber-600">Add both latitude and longitude to pin a new venue.</p>
          ) : null}
          <p className="mt-1 text-xs text-gray-500">Chosen: {chosenVenueName || "—"}</p>
          {!venueId && !venueName && (
            <p className="mt-1 text-xs text-red-600">Select a venue or type a new one.</p>
          )}
        </div>

        <div className="rounded border p-4">
          <h2 className="font-semibold">Session</h2>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">Price (EUR)</label>
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="15" className="w-full rounded border px-3 py-2" />
              {price !== "" && Number(price) < 0 && (
                <p className="mt-1 text-xs text-red-600">Price cannot be negative.</p>
              )}
            </div>
            <div />
            <div>
              <label className="mb-1 block text-sm">Starts at</label>
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-full rounded border px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm">Ends at</label>
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="w-full rounded border px-3 py-2" />
              {startsAt && endsAt && +new Date(endsAt) <= +new Date(startsAt) && (
                <p className="mt-1 text-xs text-red-600">End time must be after start.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onCreate} disabled={submitting || (!activityId && !activityName) || (!venueId && !venueName) || !startsAt || !endsAt} className="rounded bg-brand-teal px-4 py-2 text-white disabled:opacity-50">
            {submitting ? "Creating…" : "Create session"}
          </button>
        </div>
      </section>
    </main>
  );
}
