"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import SaveToggleButton from "@/components/SaveToggleButton";
import TaxonomyCategoryPicker from "@/components/TaxonomyCategoryPicker";
import { buildCreateEventQuery, buildPrefillContextSummary } from "@/lib/adminPrefill";
import {
  ACTIVITY_DISTANCE_OPTIONS,
  type MapActivity,
} from "@dowhat/shared";
import { normalizePlaceLabel } from '@/lib/places/labels';

import type { MapMovePayload } from "@/components/WebMap";
import type { ActivityAvailabilitySummary, RankedVenueActivity } from "@/lib/venues/types";
import { ACTIVITY_NAMES, type ActivityName, VENUE_SEARCH_DEFAULT_RADIUS } from "@/lib/venues/constants";
import { buildVenueTaxonomySupport } from "@/lib/venues/taxonomySupport";
import { buildVenueSavePayload } from "@/lib/venues/savePayload";
import { filterVenuesBySignals, filterVenuesByStatus, type StatusFilter } from "@/lib/venues/filters";

const WebMap = dynamic(() => import("@/components/WebMap"), {
  ssr: false,
}) as unknown as typeof import("@/components/WebMap").default;

const FALLBACK_CENTER = { lat: 51.5074, lng: -0.1278 };
const DEFAULT_LIMIT = 60;

const sanitizeCoordinate = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

type ListActivitiesResponse = {
  activities: ActivityAvailabilitySummary[];
};

type SearchFilterSupport = {
  activityTypes: boolean;
  tags: boolean;
  traits: boolean;
  taxonomyCategories: boolean;
  priceLevels: boolean;
  capacityKey: boolean;
  timeWindow: boolean;
};

type SearchVenuesResponse = {
  activity: ActivityName;
  results: RankedVenueActivity[];
  items?: MapActivity[];
  filterSupport?: SearchFilterSupport;
  facets?: {
    activityTypes: { value: string; count: number }[];
    tags: { value: string; count: number }[];
    traits: { value: string; count: number }[];
    taxonomyCategories: { value: string; count: number }[];
    priceLevels: { value: string; count: number }[];
    capacityKey: { value: string; count: number }[];
    timeWindow: { value: string; count: number }[];
  };
  sourceBreakdown?: Record<string, number>;
  cache?: { key: string; hit: boolean };
  debug?: { limitApplied: number; venueCount: number };
};

type VoteResponse = {
  totals: { yes: number; no: number };
  verification: { verifiedActivities: string[]; needsVerification: boolean };
};

type VoteFeedback = {
  type: "success" | "error";
  message: string;
  requiresAuth?: boolean;
};

type Bounds = { sw: { lat: number; lng: number }; ne: { lat: number; lng: number } };

type MapCenter = { lat: number; lng: number };

type VoteIntent = "yes" | "no";
const STATUS_FILTERS: Array<{ value: StatusFilter; label: string; helper: string }> = [
  { value: 'all', label: 'All matches', helper: 'Every AI + verified venue' },
  { value: 'verified', label: 'Verified', helper: 'Community-confirmed spots' },
  { value: 'needs_review', label: 'Needs votes', helper: 'AI confident but awaiting people' },
  { value: 'ai_only', label: 'AI only', helper: 'Fresh suggestions without votes' },
];

const CATEGORY_FILTERS: Array<{ value: string; label: string; keywords: string[] }> = [
  { value: 'all', label: 'All types', keywords: [] },
  { value: 'climbing', label: 'Climbing · Bouldering', keywords: ['climb', 'boulder'] },
  { value: 'gym', label: 'Gyms · Fitness', keywords: ['gym', 'fitness', 'studio'] },
  { value: 'sports', label: 'Sports centers', keywords: ['sport', 'stadium', 'arena'] },
  { value: 'cafe', label: 'Cafes · Coffee', keywords: ['cafe', 'coffee'] },
  { value: 'bar', label: 'Bars · Nightlife', keywords: ['bar', 'pub', 'club'] },
];

const DEFAULT_ACTIVITY_NAME: ActivityName = ACTIVITY_NAMES[0];

const DISTANCE_OPTION_CONFIG = ACTIVITY_DISTANCE_OPTIONS.map((km) => ({
  km,
  meters: km * 1000,
  label: `${km} km`,
}));

export default function VenueVerificationPage() {
  const taxonomySupport = useMemo(() => buildVenueTaxonomySupport(), []);
  const [selectedActivity, setSelectedActivityRaw] = useState<ActivityName>(DEFAULT_ACTIVITY_NAME);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(() => {
    const entry = taxonomySupport.tier3ByActivity.get(DEFAULT_ACTIVITY_NAME);
    return entry ? [entry.id] : [];
  });
  const [summary, setSummary] = useState<ActivityAvailabilitySummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [results, setResults] = useState<RankedVenueActivity[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [center, setCenter] = useState<MapCenter | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [radiusMeters, setRadiusMeters] = useState<number>(VENUE_SEARCH_DEFAULT_RADIUS);
  const [selectedDistanceKm, setSelectedDistanceKm] = useState<number | null>(() => {
    const match = DISTANCE_OPTION_CONFIG.find((option) => option.meters === VENUE_SEARCH_DEFAULT_RADIUS);
    return match?.km ?? null;
  });
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [onlyOpenNow, setOnlyOpenNow] = useState(false);
  const [onlyWithVotes, setOnlyWithVotes] = useState(false);
  const [categorySignalOnly, setCategorySignalOnly] = useState(false);
  const [keywordSignalOnly, setKeywordSignalOnly] = useState(false);
  const [priceLevelFilters, setPriceLevelFilters] = useState<number[]>([]);
  const [nameSearch, setNameSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(CATEGORY_FILTERS[0]?.value ?? 'all');
  const [voteLoadingKey, setVoteLoadingKey] = useState<string | null>(null);
  const [voteFeedback, setVoteFeedback] = useState<Record<string, VoteFeedback>>({});
  const [locationDenied, setLocationDenied] = useState(false);
  const [showTaxonomyPicker, setShowTaxonomyPicker] = useState(false);

  const selectActivity = useCallback((activity: ActivityName) => {
    setSelectedActivityRaw(activity);
  }, []);

  useEffect(() => {
    const entry = taxonomySupport.tier3ByActivity.get(selectedActivity);
    if (entry) {
      setSelectedCategoryIds([entry.id]);
    } else {
      setSelectedCategoryIds([]);
    }
  }, [selectedActivity, taxonomySupport]);

  const handleCategoryToggle = useCallback(
    (tier3Id: string) => {
      if (selectedCategoryIds.includes(tier3Id)) {
        selectActivity(DEFAULT_ACTIVITY_NAME);
        return;
      }
      const activityName = taxonomySupport.activityNameByTier3Id.get(tier3Id);
      if (activityName) {
        selectActivity(activityName);
      }
    },
    [selectedCategoryIds, selectActivity, taxonomySupport],
  );

  const handleDistanceSelect = useCallback(
    (km: number) => {
      const config = DISTANCE_OPTION_CONFIG.find((option) => option.km === km);
      if (!config) return;
      setSelectedDistanceKm(km);
      setBounds(null);
      setRadiusMeters(config.meters);
    },
    [],
  );

  const resetAdvancedFilters = useCallback(() => {
    setOnlyOpenNow(false);
    setOnlyWithVotes(false);
    setCategorySignalOnly(false);
    setKeywordSignalOnly(false);
    setPriceLevelFilters([]);
  }, []);

  const handlePriceLevelToggle = useCallback((level: number) => {
    setPriceLevelFilters((prev) => {
      if (prev.includes(level)) {
        return prev.filter((value) => value !== level);
      }
      return [...prev, level];
    });
  }, []);

  useEffect(() => {
    const match = DISTANCE_OPTION_CONFIG.find((option) => option.meters === radiusMeters);
    setSelectedDistanceKm(match?.km ?? null);
  }, [radiusMeters]);

  useEffect(() => {
    let cancelled = false;
    const fallback = () => {
      if (!cancelled) {
        setCenter((prev) => prev ?? FALLBACK_CENTER);
      }
    };

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return;
          setCenter({ lat: Number(position.coords.latitude.toFixed(6)), lng: Number(position.coords.longitude.toFixed(6)) });
        },
        () => {
          if (cancelled) return;
          setLocationDenied(true);
          fallback();
        },
        { enableHighAccuracy: true, timeout: 5000 },
      );
    } else {
      fallback();
    }

    const timeout = setTimeout(fallback, 4000);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!center) return;
    setBounds((prev) => {
      if (prev) return prev;
      const delta = 0.03;
      return {
        sw: { lat: center.lat - delta, lng: center.lng - delta },
        ne: { lat: center.lat + delta, lng: center.lng + delta },
      };
    });
  }, [center]);

  const boundsSnapshot = useMemo(() => {
    if (!bounds) return null;
    return {
      sw: { lat: bounds.sw.lat, lng: bounds.sw.lng },
      ne: { lat: bounds.ne.lat, lng: bounds.ne.lng },
    } satisfies Bounds;
  }, [bounds]);

  const centerLat = center?.lat ?? null;
  const centerLng = center?.lng ?? null;

  useEffect(() => {
    if (centerLat == null || centerLng == null) return;
    const controller = new AbortController();
    setSummaryLoading(true);
    setSummaryError(null);

    const params = new URLSearchParams();
    if (boundsSnapshot) {
      params.set("sw", `${boundsSnapshot.sw.lat.toFixed(5)},${boundsSnapshot.sw.lng.toFixed(5)}`);
      params.set("ne", `${boundsSnapshot.ne.lat.toFixed(5)},${boundsSnapshot.ne.lng.toFixed(5)}`);
    } else {
      params.set("lat", centerLat.toFixed(5));
      params.set("lng", centerLng.toFixed(5));
      params.set("radius", Math.round(radiusMeters).toString());
    }

    fetch(`/api/list-activities?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await safeJson(response);
          throw new Error(payload?.error ?? "Unable to load activity summary.");
        }
        return response.json() as Promise<ListActivitiesResponse>;
      })
      .then((data) => {
        setSummary(Array.isArray(data.activities) ? data.activities : []);
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setSummaryError(error instanceof Error ? error.message : "Unable to load activity summary.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSummaryLoading(false);
        }
      });

    return () => controller.abort();
  }, [centerLat, centerLng, boundsSnapshot, radiusMeters]);

  useEffect(() => {
    if (centerLat == null || centerLng == null) return;
    const controller = new AbortController();
    setSearchLoading(true);
    setSearchError(null);
    setSearchNotice(null);

    const params = new URLSearchParams({
      activity: selectedActivity,
      limit: String(DEFAULT_LIMIT),
      includeUnverified: "1",
    });
    if (boundsSnapshot) {
      params.set("sw", `${boundsSnapshot.sw.lat.toFixed(5)},${boundsSnapshot.sw.lng.toFixed(5)}`);
      params.set("ne", `${boundsSnapshot.ne.lat.toFixed(5)},${boundsSnapshot.ne.lng.toFixed(5)}`);
    } else {
      params.set("lat", centerLat.toFixed(5));
      params.set("lng", centerLng.toFixed(5));
      params.set("radius", Math.round(radiusMeters).toString());
    }

    fetch(`/api/search-venues?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await safeJson(response);
          throw new Error(payload?.error ?? "Unable to load venues.");
        }
        return response.json() as Promise<SearchVenuesResponse>;
      })
      .then((data) => {
        setResults(Array.isArray(data.results) ? data.results : []);
        const support = data.filterSupport ?? null;
        if (support && !support.activityTypes) {
          setSearchNotice('Activity filters are unavailable right now; showing unclassified venues.');
        }
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setSearchError(error instanceof Error ? error.message : "Unable to load venues.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedActivity, centerLat, centerLng, boundsSnapshot, radiusMeters]);

  const availablePriceLevels = useMemo(() => {
    const levels = new Set<number>();
    results.forEach((venue) => {
      if (typeof venue.priceLevel === 'number' && Number.isFinite(venue.priceLevel)) {
        const level = Math.min(Math.max(Math.round(venue.priceLevel), 1), 4);
        levels.add(level);
      }
    });
    return Array.from(levels).sort((a, b) => a - b);
  }, [results]);

  useEffect(() => {
    setPriceLevelFilters((prev) => prev.filter((level) => availablePriceLevels.includes(level)));
  }, [availablePriceLevels]);

  const priceLevelCounts = useMemo(() => {
    const counts = new Map<number, number>();
    results.forEach((venue) => {
      if (typeof venue.priceLevel === 'number' && Number.isFinite(venue.priceLevel)) {
        const level = Math.min(Math.max(Math.round(venue.priceLevel), 1), 4);
        counts.set(level, (counts.get(level) ?? 0) + 1);
      }
    });
    return counts;
  }, [results]);

  const searchFilteredVenues = useMemo(() => {
    const term = nameSearch.trim().toLowerCase();
    const categoryOption = CATEGORY_FILTERS.find((option) => option.value === categoryFilter) ?? CATEGORY_FILTERS[0];
    const categoryKeywords = categoryOption?.keywords ?? [];

    const matchesCategory = (venue: RankedVenueActivity) => {
      if (!categoryKeywords.length || categoryOption?.value === 'all') return true;
      const normalizedCategories = venue.primaryCategories.map((value) => value.toLowerCase());
      const normalizedActivity = venue.activity.toLowerCase();
      return categoryKeywords.some((keyword) => {
        if (!keyword) return false;
        const lower = keyword.toLowerCase();
        return (
          normalizedCategories.some((category) => category.includes(lower))
          || normalizedActivity.includes(lower)
        );
      });
    };

    return results.filter((venue) => {
      const matchesSearch = !term
        || venue.venueName.toLowerCase().includes(term)
        || (venue.displayAddress?.toLowerCase().includes(term) ?? false);
      return matchesSearch && matchesCategory(venue);
    });
  }, [results, nameSearch, categoryFilter]);

  const statusFilteredVenues = useMemo(
    () => filterVenuesByStatus(searchFilteredVenues, statusFilter),
    [searchFilteredVenues, statusFilter],
  );

  const visibleVenues = useMemo(
    () =>
      filterVenuesBySignals(statusFilteredVenues, {
        onlyOpenNow,
        onlyWithVotes,
        categorySignalOnly,
        keywordSignalOnly,
        priceLevelFilters,
      }),
    [
      statusFilteredVenues,
      onlyOpenNow,
      onlyWithVotes,
      categorySignalOnly,
      keywordSignalOnly,
      priceLevelFilters,
    ],
  );

  useEffect(() => {
    if (!visibleVenues.length) {
      setSelectedVenueId(null);
      return;
    }
    setSelectedVenueId((prev) => {
      if (prev && visibleVenues.some((row) => row.venueId === prev)) {
        return prev;
      }
      return visibleVenues[0]?.venueId ?? null;
    });
  }, [visibleVenues]);

  const summaryMap = useMemo(() => {
    const map = new Map<ActivityName, ActivityAvailabilitySummary>();
    summary.forEach((entry) => map.set(entry.activity, entry));
    return map;
  }, [summary]);

  const mapActivities = useMemo<MapActivity[]>(() => (
    visibleVenues.flatMap((row) => {
      const lat = sanitizeCoordinate(row.lat);
      const lng = sanitizeCoordinate(row.lng);
      if (lat == null || lng == null) return [];
      return [{
        id: row.venueId,
        name: row.venueName,
        venue: formatActivityLabel(row.activity),
        place_label: normalizePlaceLabel(row.venueName, row.displayAddress, formatActivityLabel(row.activity)),
        lat,
        lng,
        tags: buildMapTags(row),
      }];
    })
  ), [visibleVenues]);

  const selectedSummary = summaryMap.get(selectedActivity);
  const taxonomyAvailable = taxonomySupport.taxonomy.length > 0;
  const selectedCategoryMeta = selectedCategoryIds.length
    ? taxonomySupport.tier3ById.get(selectedCategoryIds[0])
    : null;
  const selectedCategoryDescription = selectedCategoryMeta
    ? `${selectedCategoryMeta.label}${selectedCategoryMeta.tier1Label ? ` • ${selectedCategoryMeta.tier1Label}` : selectedCategoryMeta.tier2Label ? ` • ${selectedCategoryMeta.tier2Label}` : ""}`
    : "All supported activities";

  const handleMoveEnd = useCallback((payload: MapMovePayload) => {
    setCenter(payload.center);
    setBounds(payload.bounds);
    setRadiusMeters(payload.radiusMeters);
  }, []);

  const handleVote = useCallback(
    async (venueId: string, intent: VoteIntent) => {
      const key = `${venueId}:${selectedActivity}`;
      setVoteLoadingKey(key);
      setVoteFeedback((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

      try {
        const response = await fetch("/api/vote-activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            venueId,
            activityName: selectedActivity,
            vote: intent === "yes",
          }),
        });

        const payload = await safeJson(response);
        if (!response.ok) {
          const requiresAuth = response.status === 401;
          const message = payload?.error ?? (requiresAuth ? "Please sign in to vote." : "Unable to save vote.");
          setVoteFeedback((prev) => ({
            ...prev,
            [key]: {
              type: "error",
              message,
              requiresAuth,
            },
          }));
          return;
        }

        const totals = payload?.totals as VoteResponse["totals"] | undefined;
        const verification = payload?.verification as VoteResponse["verification"] | undefined;
        if (totals) {
          setResults((prev) =>
            prev.map((row) => {
              if (row.venueId !== venueId) return row;
              const verified = verification?.verifiedActivities?.includes(selectedActivity) ?? row.verified;
              return {
                ...row,
                userYesVotes: totals.yes,
                userNoVotes: totals.no,
                verified,
                needsVerification: verification?.needsVerification ?? row.needsVerification,
              };
            }),
          );
        }

        setVoteFeedback((prev) => ({
          ...prev,
          [key]: {
            type: "success",
            message: intent === "yes" ? "Thanks! We'll highlight this venue." : "Got it. We'll down-rank this venue.",
          },
        }));
      } catch (error) {
        setVoteFeedback((prev) => ({
          ...prev,
          [key]: {
            type: "error",
            message: error instanceof Error ? error.message : "Unable to save vote.",
          },
        }));
      } finally {
        setVoteLoadingKey((current) => (current === key ? null : current));
      }
    },
    [selectedActivity],
  );

  const currentActivityLabel = formatActivityLabel(selectedActivity);
  const selectedVenue = visibleVenues.find((row) => row.venueId === selectedVenueId) ?? null;
  const selectedVenueSavePayload = selectedVenue ? buildVenueSavePayload(selectedVenue) : null;
  const selectedVenuePrefillSummary = buildPrefillContextSummary(
    selectedVenue,
    currentActivityLabel,
    selectedCategoryDescription,
  );
  const hasAdvancedFilters =
    onlyOpenNow ||
    onlyWithVotes ||
    categorySignalOnly ||
    keywordSignalOnly ||
    priceLevelFilters.length > 0;

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-8">
      <header className="mb-6 space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">Smart activity discovery</p>
        <h1 className="text-3xl font-bold text-slate-900">Help verify where each activity is available</h1>
        <p className="text-base text-slate-600">
          We blend AI suggestions with community signals. Pick an activity, review nearby venues, and vote to confirm whether the spot actually hosts it.
        </p>
        {locationDenied ? (
          <p className="text-sm text-slate-500">Using a fallback map center. Enable location permissions for sharper results.</p>
        ) : null}
      </header>

      <section className="mb-8 rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Activities in this area</h2>
            <p className="text-sm text-slate-500">Tap to focus the map and list. {summaryLoading ? "Updating…" : null}</p>
          </div>
          {summaryError ? <p className="text-sm text-rose-600">{summaryError}</p> : null}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ACTIVITY_NAMES.map((activity) => {
            const data = summaryMap.get(activity);
            const verifiedCount = data?.verifiedCount ?? 0;
            const likelyCount = data?.likelyCount ?? 0;
            const needsReview = data?.needsReviewCount ?? 0;
            const avgConfidence = data?.averageConfidence ?? null;
            return (
              <button
                key={activity}
                type="button"
                onClick={() => selectActivity(activity)}
                className={clsx(
                  "min-w-[220px] flex-1 rounded-2xl border px-4 py-3 text-left transition",
                  selectedActivity === activity
                    ? "border-emerald-500 bg-emerald-50/70 shadow-sm"
                    : "border-slate-200 bg-white/70 hover:border-slate-300",
                )}
                aria-pressed={selectedActivity === activity}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-base font-semibold text-slate-900">{formatActivityLabel(activity)}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{verifiedCount} verified</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">Likely {likelyCount}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">Needs review {needsReview}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">Avg confidence {formatPercent(avgConfidence)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {taxonomyAvailable ? (
        <section className="mb-8 rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Browse via shared taxonomy</h3>
              <p className="text-sm text-slate-500">
                Align host verification with the same tier 3 categories used on discovery filters.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTaxonomyPicker((prev) => !prev)}
              className="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 hover:border-slate-400"
            >
              {showTaxonomyPicker ? "Hide picker" : "Show picker"}
            </button>
          </div>
          {showTaxonomyPicker ? (
            <TaxonomyCategoryPicker
              selectedIds={selectedCategoryIds}
              onToggle={handleCategoryToggle}
              taxonomy={taxonomySupport.taxonomy}
              className="mt-4"
            />
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Current selection: <span className="font-semibold text-slate-900">{selectedCategoryDescription}</span>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Selecting a taxonomy category updates the activity chips above so every host workflow shares the same presets as the consumer filters.
          </p>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white/60 p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Map view</h3>
              <p className="text-sm text-slate-500">Drag the map to refresh suggestions.</p>
            </div>
            {searchError ? <span className="text-sm text-rose-600">{searchError}</span>
              : searchNotice ? <span className="text-sm text-amber-600">{searchNotice}</span> : null}
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold uppercase tracking-wide text-slate-500">Radius presets</span>
            {DISTANCE_OPTION_CONFIG.map((option) => (
              <button
                key={option.km}
                type="button"
                onClick={() => handleDistanceSelect(option.km)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-sm transition",
                  selectedDistanceKm === option.km
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="h-[520px] overflow-hidden rounded-2xl border border-slate-100 bg-slate-100/60">
            {center ? (
              <WebMap
                center={center}
                activities={mapActivities}
                events={[]}
                mode="activities"
                radiusMeters={radiusMeters}
                isLoading={searchLoading}
                onMoveEnd={handleMoveEnd}
                onSelectActivity={(activity: MapActivity) => setSelectedVenueId(activity.id)}
                onRequestDetails={(activity: MapActivity) => setSelectedVenueId(activity.id)}
                activeActivityId={selectedVenueId}
                activeEventId={null}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Resolving your location…</div>
            )}
          </div>
        </div>

        <div className="flex flex-col rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{currentActivityLabel} venues</h3>
              <p className="text-sm text-slate-500">
                {selectedSummary
                  ? `${selectedSummary.verifiedCount} verified • ${selectedSummary.likelyCount} likely • ${selectedSummary.needsReviewCount} need review`
                  : 'Vote to verify new spots'}
              </p>
            </div>
            {searchLoading ? <span className="text-xs text-slate-500">Refreshing…</span> : null}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Votes require a free account. We will prompt you to sign in if needed.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div>
              <label htmlFor="venues-search" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Search venues
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="venues-search"
                  type="search"
                  value={nameSearch}
                  onChange={(event) => setNameSearch(event.target.value)}
                  placeholder="e.g. Natural High"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
                />
                {nameSearch ? (
                  <button
                    type="button"
                    onClick={() => setNameSearch('')}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-400"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category focus</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {CATEGORY_FILTERS.map((option) => {
                  const active = option.value === categoryFilter;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCategoryFilter(option.value)}
                      className={clsx(
                        'rounded-full border px-3 py-1 text-sm font-semibold transition',
                        active
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatusFilter(option.value)}
                className={clsx(
                  'flex-1 min-w-[140px] rounded-2xl border px-3 py-2 text-left text-sm transition',
                  statusFilter === option.value
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                )}
              >
                <span className="block font-semibold text-slate-900">{option.label}</span>
                <span className="text-xs text-slate-500">{option.helper}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Signal filters</p>
                <p className="text-xs text-slate-500">Stack cues to focus review-ready venues.</p>
              </div>
              <button
                type="button"
                onClick={resetAdvancedFilters}
                disabled={!hasAdvancedFilters}
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition",
                  hasAdvancedFilters
                    ? "border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                    : "border-slate-200 text-slate-400",
                )}
              >
                Reset filters
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setOnlyOpenNow((prev) => !prev)}
                aria-pressed={onlyOpenNow}
                className={clsx(
                  "rounded-2xl border px-3 py-2 text-left text-sm transition",
                  onlyOpenNow
                    ? "border-emerald-500 bg-white shadow"
                    : "border-slate-200 bg-white/80 hover:border-slate-300",
                )}
              >
                <span className="block font-semibold text-slate-900">Open now</span>
                <span className="text-xs text-slate-500">Requires live hours data</span>
              </button>
              <button
                type="button"
                onClick={() => setOnlyWithVotes((prev) => !prev)}
                aria-pressed={onlyWithVotes}
                className={clsx(
                  "rounded-2xl border px-3 py-2 text-left text-sm transition",
                  onlyWithVotes
                    ? "border-emerald-500 bg-white shadow"
                    : "border-slate-200 bg-white/80 hover:border-slate-300",
                )}
              >
                <span className="block font-semibold text-slate-900">Has votes</span>
                <span className="text-xs text-slate-500">Only venues with community input</span>
              </button>
              <button
                type="button"
                onClick={() => setCategorySignalOnly((prev) => !prev)}
                aria-pressed={categorySignalOnly}
                className={clsx(
                  "rounded-2xl border px-3 py-2 text-left text-sm transition",
                  categorySignalOnly
                    ? "border-emerald-500 bg-white shadow"
                    : "border-slate-200 bg-white/80 hover:border-slate-300",
                )}
              >
                <span className="block font-semibold text-slate-900">Category match</span>
                <span className="text-xs text-slate-500">Use taxonomy overlap as a gate</span>
              </button>
              <button
                type="button"
                onClick={() => setKeywordSignalOnly((prev) => !prev)}
                aria-pressed={keywordSignalOnly}
                className={clsx(
                  "rounded-2xl border px-3 py-2 text-left text-sm transition",
                  keywordSignalOnly
                    ? "border-emerald-500 bg-white shadow"
                    : "border-slate-200 bg-white/80 hover:border-slate-300",
                )}
              >
                <span className="block font-semibold text-slate-900">Keyword signal</span>
                <span className="text-xs text-slate-500">Require AI text cues</span>
              </button>
            </div>
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Price focus</p>
              {availablePriceLevels.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPriceLevelFilters([])}
                    aria-pressed={priceLevelFilters.length === 0}
                    className={clsx(
                      "rounded-full border px-3 py-1 text-sm font-semibold transition",
                      priceLevelFilters.length === 0
                        ? "border-emerald-500 bg-white text-emerald-900"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                    )}
                  >
                    All prices
                  </button>
                  {availablePriceLevels.map((level) => {
                    const active = priceLevelFilters.includes(level);
                    const label = formatPriceLevelLabel(level) ?? "";
                    const count = priceLevelCounts.get(level) ?? 0;
                    return (
                      <button
                        key={`price-${level}`}
                        type="button"
                        onClick={() => handlePriceLevelToggle(level)}
                        aria-pressed={active}
                        className={clsx(
                          "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold transition",
                          active
                            ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                        )}
                      >
                        <span>{label || `Level ${level}`}</span>
                        <span className="text-xs font-normal text-slate-500">{count}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Price data is limited for this batch.</p>
              )}
            </div>
          </div>
          <div className="mt-4 flex-1 overflow-y-auto">
            {visibleVenues.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-slate-500">
                  <p>No venues match this filter yet.</p>
                  <p className="text-sm">Try switching filters or moving the map.</p>
              </div>
            ) : (
              <ul className="space-y-4">
                  {visibleVenues.map((venue) => {
                  const key = `${venue.venueId}:${selectedActivity}`;
                  const feedback = voteFeedback[key];
                  const savePayload = buildVenueSavePayload(venue);
                  const planPrefillSummary = buildPrefillContextSummary(
                    venue,
                    currentActivityLabel,
                    selectedCategoryDescription,
                  );
                  return (
                    <li
                      key={venue.venueId}
                      className={clsx(
                        "rounded-2xl border p-4 transition",
                        selectedVenueId === venue.venueId ? "border-emerald-400 bg-emerald-50/60" : "border-slate-200 bg-white/90 hover:border-slate-300",
                      )}
                      onClick={() => setSelectedVenueId(venue.venueId)}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-slate-900">{venue.venueName}</p>
                          <p className="text-xs uppercase tracking-wide text-slate-500">Confidence {formatPercent(venue.aiConfidence)}</p>
                          {venue.displayAddress ? (
                            <p className="mt-1 text-sm text-slate-600">{venue.displayAddress}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end gap-2 text-right">
                          <span className="rounded-full bg-slate-900/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                            Score {venue.score.toFixed(1)}
                          </span>
                          {savePayload ? (
                            <div onClick={(event) => event.stopPropagation()}>
                              <SaveToggleButton payload={savePayload} size="sm" />
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {venue.primaryCategories.length ? (
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                          {venue.primaryCategories.map((category) => (
                            <span key={`${venue.venueId}-${category}`} className="rounded-full bg-slate-100 px-2 py-0.5">
                              {category}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                        {renderStatusBadge(venue)}
                        {venue.categoryMatch ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">Category match</span>
                        ) : null}
                        {venue.keywordMatch ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Keyword signal</span>
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                        {renderOpenStatusPill(venue.openNow)}
                        {venue.hoursSummary ? <span>{venue.hoursSummary}</span> : null}
                        {formatPriceLevelLabel(venue.priceLevel) ? (
                          <span>Price {formatPriceLevelLabel(venue.priceLevel)}</span>
                        ) : null}
                        {typeof venue.rating === 'number' ? <span>⭐ {venue.rating.toFixed(1)}</span> : null}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                        <span>👍 {venue.userYesVotes}</span>
                        <span>👎 {venue.userNoVotes}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <button
                          type="button"
                          className="inline-flex flex-1 items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-60"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleVote(venue.venueId, "yes");
                          }}
                          disabled={voteLoadingKey === key}
                        >
                          Yes, it hosts this
                        </button>
                        <button
                          type="button"
                          className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-60"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleVote(venue.venueId, "no");
                          }}
                          disabled={voteLoadingKey === key}
                        >
                          No, not available
                        </button>
                      </div>
                      {feedback ? (
                        <div className={clsx(
                          "mt-2 rounded-xl px-3 py-2 text-sm",
                          feedback.type === "success"
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-rose-50 text-rose-700",
                        )}>
                          <p>{feedback.message}</p>
                          {feedback.requiresAuth ? (
                            <Link href="/auth" className="font-semibold underline">
                              Sign in to keep voting →
                            </Link>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-3">
                          <Link
                            href={{
                              pathname: '/admin/new',
                              query: buildCreateEventQuery(venue, currentActivityLabel, {
                                categoryIds: selectedCategoryIds,
                                source: 'venue_verification_list',
                              }),
                            }}
                            className="inline-flex items-center text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                            title={planPrefillSummary}
                            aria-label={`Plan an event with ${planPrefillSummary}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            Plan an event here →
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">Prefills: {planPrefillSummary}</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      {selectedVenue ? (
        <section className="mt-8 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{selectedVenue.venueName}</h3>
                  {selectedVenue.displayAddress ? (
                    <p className="mt-1 text-sm text-slate-600">{selectedVenue.displayAddress}</p>
                  ) : null}
                </div>
                {selectedVenueSavePayload ? (
                  <SaveToggleButton payload={selectedVenueSavePayload} size="md" className="justify-center" />
                ) : null}
              </div>
              {selectedVenue.primaryCategories.length ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                  {selectedVenue.primaryCategories.map((category) => (
                    <span key={`${selectedVenue.venueId}-detail-${category}`} className="rounded-full bg-slate-100 px-2 py-0.5">
                      {category}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                {renderOpenStatusPill(selectedVenue.openNow)}
                {selectedVenue.hoursSummary ? <span>{selectedVenue.hoursSummary}</span> : null}
                {formatPriceLevelLabel(selectedVenue.priceLevel) ? (
                  <span>Price {formatPriceLevelLabel(selectedVenue.priceLevel)}</span>
                ) : null}
                {typeof selectedVenue.rating === 'number' ? <span>⭐ {selectedVenue.rating.toFixed(1)}</span> : null}
              </div>
            </div>
            <div className="w-full max-w-sm rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
              <p className="text-sm font-semibold text-emerald-900">Ready to run something here?</p>
              <p className="mt-1 text-sm text-emerald-800">
                Prefill the create flow with coordinates plus
                {selectedCategoryDescription === 'All supported activities'
                  ? ' the default taxonomy preset.'
                  : ` ${selectedCategoryDescription} taxonomy tags.`}
              </p>
              {selectedVenue ? (
                <p className="mt-1 text-xs text-emerald-900">Prefills: {selectedVenuePrefillSummary}</p>
              ) : null}
              <Link
                href={{
                  pathname: '/admin/new',
                  query: buildCreateEventQuery(selectedVenue, currentActivityLabel, {
                    categoryIds: selectedCategoryIds,
                    source: 'venue_verification_detail',
                  }),
                }}
                title={selectedVenuePrefillSummary}
                aria-label={`Create event with ${selectedVenuePrefillSummary}`}
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700"
              >
                Create event →
              </Link>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <InsightCard title="AI confidence" value={formatPercent(selectedVenue.aiConfidence)} helper="Model score for this activity" />
            <InsightCard title="Community votes" value={`👍 ${selectedVenue.userYesVotes} · 👎 ${selectedVenue.userNoVotes}`} helper="Aggregated yes/no votes" />
            <InsightCard title="Signals" value={buildSignalsSummary(selectedVenue)} helper="Category + keyword cues" />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function formatActivityLabel(value: string) {
  return value
    .split(" ")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function formatPercent(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function renderStatusBadge(venue: RankedVenueActivity) {
  if (venue.verified) {
    return <span className="rounded-full bg-emerald-600/90 px-2 py-0.5 text-white">Verified</span>;
  }
  if (venue.needsVerification) {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">Needs verification</span>;
  }
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">AI suggestion</span>;
}

function renderOpenStatusPill(openNow: boolean | null) {
  if (openNow == null) return null;
  const label = openNow ? 'Open now' : 'Closed';
  const styles = openNow ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
  return <span className={`rounded-full px-2 py-0.5 font-semibold ${styles}`}>{label}</span>;
}

function buildMapTags(venue: RankedVenueActivity) {
  const tags: string[] = [];
  if (venue.verified) tags.push("verified");
  if (venue.needsVerification) tags.push("needs_verification");
  if (venue.categoryMatch) tags.push("category");
  if (venue.keywordMatch) tags.push("keyword");
  return tags;
}

function formatPriceLevelLabel(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  const level = Math.min(Math.max(Math.round(value), 1), 4);
  return '$'.repeat(level);
}


function buildSignalsSummary(venue: RankedVenueActivity) {
  const parts: string[] = [];
  if (venue.categoryMatch) parts.push("Category");
  if (venue.keywordMatch) parts.push("Keyword");
  if (!parts.length) parts.push("AI only");
  return parts.join(" + ");
}

type InsightCardProps = {
  title: string;
  value: string;
  helper: string;
};

function InsightCard({ title, value, helper }: InsightCardProps) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{helper}</p>
    </div>
  );
}
