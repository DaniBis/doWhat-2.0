"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback, useId } from "react";
import { useSearchParams } from "next/navigation";

import TaxonomyCategoryPicker from "@/components/TaxonomyCategoryPicker";
import {
  activityTaxonomy,
  defaultTier3Index,
  trackSessionOpenSlotsPublished,
  type ActivityTier3WithAncestors,
} from "@dowhat/shared";
import { normaliseCategoryIds } from "@/lib/adminPrefill";
import { supabase } from "@/lib/supabase/browser";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

const MIN_OPEN_SLOT_COUNT = 1;
const MAX_OPEN_SLOT_COUNT = 12;

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

  const lookingForPlayersFeatureEnabled =
    process.env.NEXT_PUBLIC_FEATURE_LOOKING_FOR_PLAYERS !== "false";

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

  const [lookingForPlayers, setLookingForPlayers] = useState(false);
  const [openSlotsCount, setOpenSlotsCount] = useState("1");
  const [requiredSkillLevel, setRequiredSkillLevel] = useState("");
  const playersNeededInputId = useId();
  const skillFocusInputId = useId();
  const lookingForPlayersToggleId = useId();

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
    setLookingForPlayers(false);
    setOpenSlotsCount("1");
    setRequiredSkillLevel("");
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

  const hasPrefilledActivity = Boolean(prefill.activityId || prefill.activityName);
  const hasPrefilledVenue = Boolean(
    prefill.venueId ||
      prefill.venueName ||
      prefill.venueAddress ||
      prefill.lat ||
      prefill.lng,
  );
  const manualActivityEntry = Boolean(!activityId && activityName.trim());
  const manualVenueEntry = Boolean(!venueId && venueName.trim());
  const coordinatesProvided = latProvided && lngProvided;
  const fakeSessionRisk: "low" | "medium" | "high" = manualActivityEntry && manualVenueEntry && !coordinatesProvided
    ? "high"
    : manualActivityEntry || manualVenueEntry
      ? "medium"
      : "low";

  const openSlotsNumber = Number(openSlotsCount);
  const hasOpenSlotsNumber = Number.isFinite(openSlotsNumber);
  const openSlotsBelowMin = hasOpenSlotsNumber && openSlotsNumber < MIN_OPEN_SLOT_COUNT;
  const openSlotsAboveMax = hasOpenSlotsNumber && openSlotsNumber > MAX_OPEN_SLOT_COUNT;
  const openSlotsInvalid =
    lookingForPlayersFeatureEnabled &&
    lookingForPlayers &&
    (!hasOpenSlotsNumber || openSlotsBelowMin || openSlotsAboveMax);
  const normalizedOpenSlotsCount = hasOpenSlotsNumber
    ? Math.min(MAX_OPEN_SLOT_COUNT, Math.max(MIN_OPEN_SLOT_COUNT, Math.floor(openSlotsNumber)))
    : null;
  const openSlotsHelperText = openSlotsInvalid
    ? `Enter between ${MIN_OPEN_SLOT_COUNT} and ${MAX_OPEN_SLOT_COUNT} players.`
    : "We will show this CTA on discovery surfaces once QA signs off.";
  const shouldCreateOpenSlots = lookingForPlayersFeatureEnabled && lookingForPlayers && !openSlotsInvalid;

  const disableCreateButton =
    submitting ||
    (!activityId && !activityName) ||
    (!venueId && !venueName) ||
    !startsAt ||
    !endsAt ||
    openSlotsInvalid;

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
    let createdSessionId: string | null = null;
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
      createdSessionId = data.id;

      if (shouldCreateOpenSlots) {
        if (!normalizedOpenSlotsCount) {
          throw new Error("Enter how many players you're looking for.");
        }
        const trimmedSkillLevel = requiredSkillLevel.trim();
        const { error: openSlotError } = await supabase
          .from("session_open_slots")
          .insert({
            session_id: createdSessionId,
            slots_count: normalizedOpenSlotsCount,
            required_skill_level: trimmedSkillLevel ? trimmedSkillLevel : null,
          })
          .select("id")
          .single<{ id: string }>();
        if (openSlotError) {
          await supabase.from("sessions").delete().eq("id", createdSessionId);
          throw openSlotError;
        }
        trackSessionOpenSlotsPublished({
          sessionId: createdSessionId,
          slotsCount: normalizedOpenSlotsCount,
          platform: "web",
          surface: "admin/new",
          requiredSkillLevel: trimmedSkillLevel ? trimmedSkillLevel : null,
          prefillSource: prefill.source,
          categoryCount: sanitizedCategoryIds.length,
          activityPrefilled: hasPrefilledActivity,
          venuePrefilled: hasPrefilledVenue,
          manualActivityEntry,
          manualVenueEntry,
          fakeSessionRisk,
          coordinatesProvided,
        });
      }

      setMsg("Session created. Redirecting…");
      if (!createdSessionId) {
        throw new Error("Session created without an id. Please try again.");
      }
      // Navigate to the new session page
      window.location.href = `/sessions/${createdSessionId}`;
    } catch (error: unknown) {
      setErr(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (isAdmin === false) {
    return (
      <main className="mx-auto max-w-4xl px-md py-xxl text-ink-strong">
        <div className="mb-md flex items-center gap-xs text-sm">
          <Link href="/" className="text-brand-teal">&larr; Back</Link>
          <h1 className="text-lg font-semibold text-ink-strong">Create Session</h1>
        </div>
        <div className="rounded-xl border border-feedback-danger/30 bg-surface p-md text-sm text-feedback-danger shadow-card">
          <p className="font-semibold">You don’t have access to this page.</p>
          <p className="mt-xxs text-xs text-feedback-danger/80">
            Ask an admin to add your email to NEXT_PUBLIC_ADMIN_EMAILS.
          </p>
          <div className="mt-xs text-xs text-feedback-danger/80">Signed in as: {userEmail ?? "(not signed in)"}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-md py-xxl text-ink-strong">
      <div className="mb-md flex flex-wrap items-center gap-xs text-sm">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-lg font-semibold text-ink-strong">Create Session</h1>
      </div>

      {hasPrefillNotice ? (
        <div
          className="mb-sm rounded-xl border border-brand-teal/30 bg-brand-teal/5 px-md py-sm text-sm text-brand-teal shadow-card"
          role="status"
          aria-live="polite"
        >
          <p className="font-semibold">
            Prefilled {prefillSourceLabel ? `via ${prefillSourceLabel}` : "from query parameters"}.
          </p>
          <p className="text-xs text-brand-teal/80">Confirm taxonomy tags and coordinates before publishing.</p>
          {prefilledCategorySummaryList.length ? (
            <p className="mt-xxs text-xs text-brand-teal/80">
              Taxonomy preset: <span className="font-semibold">{prefilledCategorySummaryList.join(", ")}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {prefillSummary.length ? (
        <div className="mb-md rounded-xl border border-midnight-border bg-surface p-md text-sm text-ink-strong shadow-card">
          <div className="mb-xs flex items-center justify-between gap-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Prefill summary</p>
            <button
              type="button"
              onClick={handleResetPrefills}
              className="rounded-full border border-brand-teal/40 px-sm py-xxs text-xs font-semibold text-brand-teal transition hover:border-brand-teal"
              aria-label="Clear all prefilled values"
            >
              Clear prefills
            </button>
          </div>
          <ul className="space-y-xxs">
            {prefillSummary.map((item) => (
              <li key={item.label} className="flex items-start gap-xs">
                <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {item.label}
                </span>
                <span className="flex-1 text-sm text-ink-strong">{item.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {prefillWarnings.length ? (
        <div
          className="mb-md rounded-xl border border-feedback-warning/40 bg-feedback-warning/10 px-md py-sm text-sm text-feedback-warning shadow-card"
          role="status"
          aria-live="polite"
        >
          <p className="font-semibold">Check venue details before publishing</p>
          <ul className="mt-xxs list-disc space-y-xxs pl-lg text-xs text-feedback-warning/90">
            {prefillWarnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

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

      <section className="grid gap-lg">
        <div className="rounded-xl border border-midnight-border bg-surface p-lg shadow-card">
          <h2 className="text-base font-semibold text-ink-strong">Activity</h2>
          <div className="mt-sm grid grid-cols-1 gap-sm sm:grid-cols-2">
            <div>
              <label className="mb-xxs block text-xs font-semibold uppercase tracking-wide text-ink-muted">Select existing</label>
              <select
                data-testid="admin-new-activity-select"
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
                className="w-full rounded-lg border border-midnight-border px-sm py-xs text-sm text-ink-strong focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
              >
                <option value="">-- none --</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-xxs block text-xs font-semibold uppercase tracking-wide text-ink-muted">Or new name</label>
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
                className="w-full rounded-lg border border-midnight-border px-sm py-xs text-sm text-ink-strong focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
              />
            </div>
          </div>
          <p className="mt-xs text-xs text-ink-muted">Chosen: {chosenActivityName || "—"}</p>
          {!activityId && !activityName && (
            <p className="mt-xxs text-xs text-feedback-danger">Select an activity or type a new one.</p>
          )}
          <div className="mt-md rounded-xl border border-midnight-border bg-surface p-md shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <div>
                <h3 className="text-base font-semibold text-ink-strong">Activity categories</h3>
                <p className="text-sm text-ink-muted">Tag the activity with tier 3 taxonomy entries so admin tools stay in sync with discovery filters.</p>
              </div>
              <span className="text-xs text-ink-muted">{sanitizedCategoryIds.length} selected</span>
            </div>
            <TaxonomyCategoryPicker
              selectedIds={selectedCategories}
              onToggle={handleToggleCategory}
              taxonomy={activityTaxonomy}
              className="mt-md"
            />
            <div className="mt-sm flex flex-wrap gap-xs text-xs text-ink-muted">
              {selectedCategoryLabels.length ? (
                selectedCategoryLabels.map((item) => (
                  <span
                    key={item.id}
                    className="rounded-full border border-brand-teal/40 bg-brand-teal/10 px-sm py-xxs font-semibold text-brand-teal"
                  >
                    {item.label}
                    {item.parent ? ` • ${item.parent}` : ""}
                  </span>
                ))
              ) : (
                <span className="text-ink-muted">No categories selected yet.</span>
              )}
            </div>
            <p className="mt-xs text-xs text-ink-muted">Selected categories are saved back to the activity so hosts and discovery filters stay aligned.</p>
          </div>
        </div>

        <div className="rounded-xl border border-midnight-border bg-surface p-lg shadow-card">
          <h2 className="text-base font-semibold text-ink-strong">Venue</h2>
          <div className="mt-sm grid grid-cols-1 gap-sm sm:grid-cols-2">
            <div>
              <label className="mb-xxs block text-xs font-semibold uppercase tracking-wide text-ink-muted">Select existing</label>
              <select
                data-testid="admin-new-venue-select"
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                className="w-full rounded-lg border border-midnight-border px-sm py-xs text-sm text-ink-strong focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
              >
                <option value="">-- none --</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-xxs block text-xs font-semibold uppercase tracking-wide text-ink-muted">Or new name</label>
              <input
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                placeholder="e.g. City Park"
                className="w-full rounded-lg border border-midnight-border px-sm py-xs text-sm text-ink-strong focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
              />
            </div>
          </div>
          <div className="mt-sm grid grid-cols-1 gap-sm sm:grid-cols-2">
            <div>
              <label className="mb-xxs block text-xs font-semibold uppercase tracking-wide text-ink-muted">Latitude (optional)</label>
              <input
                value={venueLat}
                onChange={(e) => setVenueLat(e.target.value)}
                inputMode="decimal"
                placeholder="51.5074"
                className="w-full rounded-lg border border-midnight-border px-sm py-xs text-sm text-ink-strong focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
              />
              {latInvalid ? (
                <p className="mt-xxs text-xs text-feedback-danger">Enter a numeric latitude between -90 and 90.</p>
              ) : null}
              {!latInvalid && latOutOfRange ? (
                <p className="mt-xxs text-xs text-feedback-danger">Latitude must be between -90° and 90°.</p>
              ) : null}
            </div>
            <div>
              <label className="mb-xxs block text-xs font-semibold uppercase tracking-wide text-ink-muted">Longitude (optional)</label>
              <input
                value={venueLng}
                onChange={(e) => setVenueLng(e.target.value)}
                inputMode="decimal"
                placeholder="-0.1278"
                className="w-full rounded-lg border border-midnight-border px-sm py-xs text-sm text-ink-strong focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
              />
              {lngInvalid ? (
                <p className="mt-xxs text-xs text-feedback-danger">Enter a numeric longitude between -180 and 180.</p>
              ) : null}
              {!lngInvalid && lngOutOfRange ? (
                <p className="mt-xxs text-xs text-feedback-danger">Longitude must be between -180° and 180°.</p>
              ) : null}
            </div>
          </div>
          {coordinateMismatch ? (
            <p className="mt-xs text-xs text-feedback-warning">Add both latitude and longitude to pin a new venue.</p>
          ) : null}
          <p className="mt-xs text-xs text-ink-muted">Chosen: {chosenVenueName || "—"}</p>
          {!venueId && !venueName && (
            <p className="mt-xxs text-xs text-feedback-danger">Select a venue or type a new one.</p>
          )}
        </div>

        <div className="rounded-xl border border-midnight-border bg-surface p-lg shadow-card">
          <h2 className="text-base font-semibold text-ink-strong">Session</h2>
          <div className="mt-sm grid grid-cols-1 gap-sm sm:grid-cols-2">
            <div>
              <label className="mb-xxs block text-xs font-semibold uppercase tracking-wide text-ink-muted">Price (EUR)</label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="15"
                className="w-full rounded-lg border border-midnight-border px-sm py-xs text-sm text-ink-strong focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
              />
              {price !== "" && Number(price) < 0 && (
                <p className="mt-xxs text-xs text-feedback-danger">Price cannot be negative.</p>
              )}
            </div>
            <div />
            <div>
              <label className="mb-xxs block text-xs font-semibold uppercase tracking-wide text-ink-muted">Starts at</label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-lg border border-midnight-border px-sm py-xs text-sm text-ink-strong focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
              />
            </div>
            <div>
              <label className="mb-xxs block text-xs font-semibold uppercase tracking-wide text-ink-muted">Ends at</label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-lg border border-midnight-border px-sm py-xs text-sm text-ink-strong focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
              />
              {startsAt && endsAt && +new Date(endsAt) <= +new Date(startsAt) && (
                <p className="mt-xxs text-xs text-feedback-danger">End time must be after start.</p>
              )}
            </div>
          </div>
          {lookingForPlayersFeatureEnabled ? (
            <div className="mt-md rounded-xl border border-dashed border-brand-teal/50 bg-brand-teal/5 p-md">
              <div className="flex flex-wrap items-start justify-between gap-sm">
                <div>
                  <h3 className="text-base font-semibold text-ink-strong">Looking for players</h3>
                  <p className="text-sm text-ink-muted">
                    Flag remaining spots so doWhat can promote this session during discovery pilots.
                  </p>
                </div>
                <label className="flex items-center gap-xs text-sm font-semibold text-brand-teal" htmlFor={lookingForPlayersToggleId}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-midnight-border text-brand-teal focus:ring-brand-teal"
                    id={lookingForPlayersToggleId}
                    checked={lookingForPlayers}
                    onChange={(event) => {
                      setLookingForPlayers(event.target.checked);
                      if (!event.target.checked) {
                        setOpenSlotsCount("1");
                        setRequiredSkillLevel("");
                      }
                    }}
                    aria-label="Toggle Looking for players"
                  />
                  Add CTA
                </label>
              </div>
              {lookingForPlayers ? (
                <div className="mt-md grid grid-cols-1 gap-sm sm:grid-cols-2">
                  <div>
                    <label className="mb-xxs block text-xs font-semibold uppercase tracking-wide text-ink-muted" htmlFor={playersNeededInputId}>
                      Players needed
                    </label>
                    <input
                      type="number"
                      min={MIN_OPEN_SLOT_COUNT}
                      max={MAX_OPEN_SLOT_COUNT}
                      inputMode="numeric"
                      id={playersNeededInputId}
                      value={openSlotsCount}
                      onChange={(event) => setOpenSlotsCount(event.target.value)}
                      className="w-full rounded-lg border border-midnight-border px-sm py-xs text-sm text-ink-strong focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                      aria-invalid={openSlotsInvalid}
                    />
                    <p className={`mt-xxs text-xs ${openSlotsInvalid ? "text-feedback-danger" : "text-ink-muted"}`}>
                      {openSlotsHelperText}
                    </p>
                  </div>
                  <div>
                    <label className="mb-xxs block text-xs font-semibold uppercase tracking-wide text-ink-muted" htmlFor={skillFocusInputId}>
                      Skill focus (optional)
                    </label>
                    <input
                      value={requiredSkillLevel}
                      onChange={(event) => setRequiredSkillLevel(event.target.value)}
                      placeholder="e.g. Intermediate runners"
                      id={skillFocusInputId}
                      className="w-full rounded-lg border border-midnight-border px-sm py-xs text-sm text-ink-strong focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                      maxLength={120}
                    />
                    <p className="mt-xxs text-xs text-ink-muted">Helps us show this card to sport-specific members.</p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-sm">
          <button
            onClick={onCreate}
            disabled={disableCreateButton}
            className="rounded-full bg-brand-teal px-lg py-xs text-sm font-semibold text-white shadow-card transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create session"}
          </button>
        </div>
      </section>
    </main>
  );
}
