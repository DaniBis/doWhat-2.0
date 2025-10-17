"use client";

import dynamic from "next/dynamic";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_RADIUS_METERS,
  createNearbyActivitiesFetcher,
  trackAnalyticsEvent,
  type MapActivity,
  type MapCoordinates,
  useNearbyActivities,
} from "@dowhat/shared";

import { supabase } from "@/lib/supabase/browser";

const WebMap = dynamic(() => import("@/components/WebMap"), { ssr: false });

const FALLBACK_CENTER: MapCoordinates = { lat: 51.5074, lng: -0.1278 }; // London default

const formatKilometres = (meters?: number | null) => {
  if (!meters || meters <= 0) return "<0.5 km";
  const km = meters / 1000;
  if (km < 1) return `${Math.round(km * 10) / 10} km`;
  return `${Math.round(km * 10) / 10} km`;
};

type MovePayload = { center: MapCoordinates; radiusMeters: number; zoom: number };

type ToggleOption = "map" | "list";

export default function MapPage() {
  const [center, setCenter] = useState<MapCoordinates | null>(null);
  const [radiusMeters, setRadiusMeters] = useState<number>(DEFAULT_RADIUS_METERS);
  const [viewMode, setViewMode] = useState<ToggleOption>("map");
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<string[]>([]);
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [locationErrored, setLocationErrored] = useState(false);
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fallback = () => {
      if (!cancelled) setCenter((prev) => prev ?? FALLBACK_CENTER);
    };
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          if (cancelled) return;
          setCenter({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) });
        },
        () => {
          setLocationErrored(true);
          fallback();
        },
        { enableHighAccuracy: true, timeout: 7000 },
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
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (mounted) setIsAuthenticated(Boolean(data.user));
      } catch {
        if (mounted) setIsAuthenticated(false);
      }
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session?.user));
    });
    return () => {
      listener.subscription.unsubscribe();
      mounted = false;
    };
  }, []);

  const fetcher = useMemo(
    () =>
      createNearbyActivitiesFetcher({
        buildUrl: () => {
          const origin = typeof window !== "undefined" ? window.location.origin : "";
          if (!origin) throw new Error("Unable to determine origin for nearby fetcher");
          return `${origin}/api/nearby`;
        },
        includeCredentials: true,
      }),
    [],
  );

  const track = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      trackAnalyticsEvent(event, { platform: "web", ...payload });
    },
    [],
  );

  const query = center
    ? {
        center,
        radiusMeters,
        limit: 150,
        filters: {
          activityTypes: selectedActivityTypes,
          traits: selectedTraits,
        },
      }
    : null;

  const nearby = useNearbyActivities(query, {
    fetcher,
    enabled: Boolean(center),
  });

  const activities = nearby.data?.activities ?? [];

  const availableActivityTypes = useMemo(() => {
    const set = new Set<string>();
    for (const activity of activities) {
      for (const type of activity.activity_types ?? []) {
        if (typeof type === "string" && type.trim()) set.add(type.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activities]);

  const availableTraits = useMemo(() => {
    const set = new Set<string>();
    for (const activity of activities) {
      for (const trait of activity.traits ?? []) {
        if (typeof trait === "string" && trait.trim()) set.add(trait.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activities]);

  const toggleActivityType = (value: string) => {
    setSelectedActivityTypes((prev) => {
      const active = prev.includes(value);
      const next = active ? prev.filter((v) => v !== value) : [...prev, value];
      track('map_filter_activity', { value, active: !active });
      return next;
    });
  };
  const toggleTrait = (value: string) => {
    setSelectedTraits((prev) => {
      const active = prev.includes(value);
      const next = active ? prev.filter((v) => v !== value) : [...prev, value];
      track('map_filter_trait', { value, active: !active });
      return next;
    });
  };

  const resetFilters = () => {
    track('map_filters_reset', {
      activityTypes: selectedActivityTypes.length,
      traits: selectedTraits.length,
    });
    setSelectedActivityTypes([]);
    setSelectedTraits([]);
  };

  const changeViewMode = useCallback(
    (mode: ToggleOption) => {
      setViewMode(mode);
      track('map_toggle_view', { view: mode });
    },
    [track],
  );

  const handleMoveEnd = useCallback(
    ({ center: nextCenter, radiusMeters: nextRadius }: MovePayload) => {
      const centerChanged =
        !center ||
        Math.abs(center.lat - nextCenter.lat) > 0.0005 ||
        Math.abs(center.lng - nextCenter.lng) > 0.0005;
      setCenter((prev) => {
        if (!prev) return nextCenter;
        const deltaLat = Math.abs(prev.lat - nextCenter.lat);
        const deltaLng = Math.abs(prev.lng - nextCenter.lng);
        return deltaLat > 0.0005 || deltaLng > 0.0005 ? nextCenter : prev;
      });
      const normalizedRadius = Number.isFinite(nextRadius)
        ? Math.max(300, Math.min(25_000, Math.round(nextRadius)))
        : radiusMeters;
      const radiusChanged = Math.abs(normalizedRadius - radiusMeters) > 250;
      setRadiusMeters((prev) => (radiusChanged ? normalizedRadius : prev));
      if (centerChanged || radiusChanged) {
        track('map_region_change', {
          lat: Number(nextCenter.lat.toFixed(5)),
          lng: Number(nextCenter.lng.toFixed(5)),
          radiusMeters: normalizedRadius,
          source: 'drag',
        });
      }
    },
    [center, radiusMeters, track],
  );

  const handleActivitySelect = useCallback(
    (activity: MapActivity) => {
      setSelectedActivityId(activity.id);
      track('map_activity_focus', { activityId: activity.id, source: 'map' });
    },
    [track],
  );

  const handleFocusActivity = useCallback(
    (activity: MapActivity) => {
      if (!activity.lat || !activity.lng) return;
      setSelectedActivityId(activity.id);
      track('map_activity_focus', { activityId: activity.id, source: 'list' });
      changeViewMode('map');
      setCenter({ lat: activity.lat, lng: activity.lng });
    },
    [changeViewMode, track],
  );

  const handleRequireAuth = useCallback(
    (activityId: string) => {
      const target = `/activities/${activityId}`;
      track('map_activity_details_requested', {
        activityId,
        authenticated: isAuthenticated === true,
      });
      if (isAuthenticated) {
        router.push(target as Route);
      } else {
        router.push(`/auth?redirect=${encodeURIComponent(target)}` as Route);
      }
    },
    [isAuthenticated, router, track],
  );

  const handleRequestDetails = useCallback(
    (activity: MapActivity) => {
      handleRequireAuth(activity.id);
    },
    [handleRequireAuth],
  );

  const activeFiltersCount = selectedActivityTypes.length + selectedTraits.length;

  useEffect(() => {
    if (!nearby.data) return;
    track('map_view', {
      activityCount: nearby.data.activities.length,
      radiusMeters: nearby.data.radiusMeters,
      filtersApplied: activeFiltersCount,
      source: nearby.data.source ?? 'unknown',
    });
  }, [nearby.data, activeFiltersCount, track]);

  const sortedActivities = useMemo(() => {
    return [...activities].sort((a, b) => (a.distance_m ?? Number.POSITIVE_INFINITY) - (b.distance_m ?? Number.POSITIVE_INFINITY));
  }, [activities]);

  if (!center) {
    return (
      <div className="flex h-[calc(100dvh-64px)] items-center justify-center text-sm text-slate-500">
        {locationErrored ? "Location unavailable. Using default city…" : "Locating you…"}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-64px)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => changeViewMode("map")}
            className={`rounded-full px-3 py-1 font-medium ${viewMode === "map" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"} lg:hidden`}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => changeViewMode("list")}
            className={`rounded-full px-3 py-1 font-medium ${viewMode === "list" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"} lg:hidden`}
          >
            List
          </button>
          <div className="hidden text-sm font-semibold text-slate-700 lg:block">Nearby activities</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-xs text-slate-500 lg:block">
            Showing {activities.length} in ~{formatKilometres(radiusMeters)} radius
          </div>
          <button
            type="button"
            onClick={() => {
              setFiltersOpen(true);
              track('map_filters_opened');
            }}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-600 px-3 py-1 text-sm font-medium text-emerald-600 hover:bg-emerald-50"
          >
            Filters
            {activeFiltersCount > 0 && (
              <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-emerald-600 px-1 text-xs font-semibold text-white">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          className={`${viewMode === "map" ? "flex" : "hidden"} h-[50vh] min-h-[320px] flex-1 bg-slate-100 lg:flex lg:h-auto`}
        >
          <WebMap
            center={center}
            activities={activities}
            radiusMeters={radiusMeters}
            isLoading={nearby.isLoading}
            onMoveEnd={handleMoveEnd}
            onSelectActivity={handleActivitySelect}
            onRequestDetails={handleRequestDetails}
          />
        </div>
        <aside
          className={`${viewMode === "list" ? "flex" : "hidden"} h-[50vh] min-h-[320px] flex-col border-t border-slate-200 bg-white lg:flex lg:h-auto lg:w-[420px] lg:border-l`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-xs text-slate-500">
            <span>{sortedActivities.length} results</span>
            <span>Radius ~{formatKilometres(radiusMeters)}</span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {nearby.isLoading && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Loading nearby activities…
              </div>
            )}
            {nearby.isError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                {(nearby.error?.message ?? "Failed to load activities")}
              </div>
            )}
            {!nearby.isLoading && !nearby.isError && sortedActivities.length === 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                No activities match those filters yet. Try widening your search.
              </div>
            )}
            <ul className="space-y-3">
              {sortedActivities.map((activity) => {
                const isSelected = activity.id === selectedActivityId;
                return (
                  <li key={activity.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleFocusActivity(activity)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleFocusActivity(activity);
                        }
                      }}
                      className={`cursor-pointer rounded-2xl border px-4 py-4 transition ${isSelected ? "border-emerald-500 bg-emerald-50 shadow" : "border-slate-200 bg-white hover:border-emerald-400"}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-base font-semibold text-slate-900">{activity.name}</div>
                          {activity.venue && <div className="mt-1 text-xs text-slate-500">📍 {activity.venue}</div>}
                          {activity.activity_types && activity.activity_types.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {activity.activity_types.slice(0, 3).map((type) => (
                                <span
                                  key={type}
                                  className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                                >
                                  {type}
                                </span>
                              ))}
                              {activity.activity_types.length > 3 && (
                                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                                  +{activity.activity_types.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          {activity.distance_m != null ? `~${formatKilometres(activity.distance_m)}` : null}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRequireAuth(activity.id);
                          }}
                          className="text-emerald-600 hover:text-emerald-700"
                        >
                          View details →
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-600 hover:border-emerald-400 hover:text-emerald-600"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleFocusActivity(activity);
                          }}
                        >
                          Show on map
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-40 flex bg-slate-900/40">
          <div className="ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Filters</h2>
                <p className="text-xs text-slate-500">Refine by activity and people preferences.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFiltersOpen(false);
                  track('map_filters_closed', { via: 'header' });
                }}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-slate-300"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Activity types</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {availableActivityTypes.length === 0 && (
                    <p className="text-xs text-slate-400">We will populate suggestions as soon as activities load.</p>
                  )}
                  {availableActivityTypes.map((type) => {
                    const active = selectedActivityTypes.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleActivityType(type)}
                        className={`rounded-full border px-3 py-1 text-sm ${active ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:border-emerald-400"}`}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-6">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">People traits</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {availableTraits.length === 0 && (
                    <p className="text-xs text-slate-400">Traits appear when activities provide preferences.</p>
                  )}
                  {availableTraits.map((trait) => {
                    const active = selectedTraits.includes(trait);
                    return (
                      <button
                        key={trait}
                        type="button"
                        onClick={() => toggleTrait(trait)}
                        className={`rounded-full border px-3 py-1 text-sm ${active ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:border-emerald-400"}`}
                      >
                        {trait}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200 px-5 py-4 text-sm">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFiltersOpen(false);
                    track('map_filters_closed', { via: 'apply' });
                  }}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Apply filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
