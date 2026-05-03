"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState, useEffect, useCallback, useRef } from "react";

import {
  CITY_SWITCHER_ENABLED,
  DEFAULT_CITY_SLUG,
  createPlacesFetcher,
  debounce,
  filterTaxonomyForActivityDiscovery,
  flattenTaxonomy,
  formatPlaceUpdatedLabel,
  getCityConfig,
  listCities,
  trackTaxonomyFiltersApplied,
  trackTaxonomyToggle,
  type ActivityTier3WithAncestors,
  type PlaceSummary,
  type PlacesViewportQuery,
} from "@dowhat/shared";

import { PlacesMap } from "@/components/PlacesMap";
import TaxonomyCategoryPicker from "@/components/TaxonomyCategoryPicker";
import { useRuntimeTaxonomy } from "@/hooks/useRuntimeTaxonomy";
import { usePlaces } from "./queryHooks";

const EMPTY_PLACES: PlaceSummary[] = [];

const ensureOrigin = () => {
  if (typeof window === "undefined") return "";
  return window.location.origin;
};

type Bounds = PlacesViewportQuery["bounds"];

type MovePayload = { bounds: Bounds; center: { lat: number; lng: number } };

export default function PlacesPage() {
  const availableCities = useMemo(() => listCities(), []);
  const [citySlug, setCitySlug] = useState<string>(DEFAULT_CITY_SLUG);
  const city = useMemo(() => getCityConfig(citySlug), [citySlug]);
  const { taxonomy } = useRuntimeTaxonomy();
  const discoveryTaxonomy = useMemo(() => filterTaxonomyForActivityDiscovery(taxonomy), [taxonomy]);
  const discoveryTier3Index = useMemo<ActivityTier3WithAncestors[]>(
    () => flattenTaxonomy(discoveryTaxonomy),
    [discoveryTaxonomy],
  );
  const taxonomyTier3Set = useMemo(
    () => new Set(discoveryTier3Index.map((entry) => entry.id)),
    [discoveryTier3Index],
  );
  const tier3ById = useMemo(
    () => new Map(discoveryTier3Index.map((entry) => [entry.id, entry])),
    [discoveryTier3Index],
  );
  const citySwitcherEnabled = CITY_SWITCHER_ENABLED;

  const [center, setCenter] = useState(() => city.center);
  const [bounds, setBounds] = useState<Bounds | null>(() => city.bbox);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [attributions, setAttributions] = useState<Array<{ text: string; url?: string; license?: string }>>([]);
  const [hasLocationFix, setHasLocationFix] = useState(false);

  useEffect(() => {
    setCenter(city.center);
    setBounds(city.bbox);
    setSelectedCategories((prev) => prev.filter((key) => taxonomyTier3Set.has(key)));
    setSelectedPlaceId(null);
  }, [city, taxonomyTier3Set]);

  useEffect(() => {
    let cancelled = false;
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return;
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setCenter({ lat, lng });
          const delta = 0.02;
          setBounds({
            sw: { lat: lat - delta, lng: lng - delta },
            ne: { lat: lat + delta, lng: lng + delta },
          });
          setHasLocationFix(true);
        },
        () => {
          setHasLocationFix(false);
          // Silent fallback
        },
        { enableHighAccuracy: true, timeout: 5000 },
      );
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const fetcher = useMemo(
    () =>
      createPlacesFetcher({
        buildUrl: () => {
          const origin = ensureOrigin();
          if (!origin) throw new Error("Unable to resolve origin for places endpoint");
          return `${origin}/api/places`;
        },
        includeCredentials: true,
      }),
    [],
  );

  const categoriesForQuery = useMemo(() => {
    const deduped = Array.from(new Set(selectedCategories.filter((id) => taxonomyTier3Set.has(id))));
    return deduped.length ? deduped : undefined;
  }, [selectedCategories, taxonomyTier3Set]);

  const query = bounds
    ? {
        bounds,
        limit: 200,
        city: city.slug,
        ...(categoriesForQuery ? { discoveryFilters: { taxonomyCategories: categoriesForQuery } } : {}),
      }
    : null;

  const placesQuery = usePlaces(query, {
    fetcher,
    enabled: Boolean(bounds),
    staleTime: 2 * 60_000,
  });

  useEffect(() => {
    if (!bounds) {
      const delta = 0.02;
      setBounds({
        sw: { lat: center.lat - delta, lng: center.lng - delta },
        ne: { lat: center.lat + delta, lng: center.lng + delta },
      });
    }
  }, [bounds, center.lat, center.lng]);

  useEffect(() => {
    if (placesQuery.data?.attribution) {
      setAttributions(placesQuery.data.attribution);
    }
  }, [placesQuery.data?.attribution]);

  const rawPlaces = placesQuery.data?.places ?? EMPTY_PLACES;
  const places = rawPlaces;

  const debouncedBoundsUpdate = useMemo(
    () =>
      debounce((payload: MovePayload) => {
        setBounds(payload.bounds);
        setCenter(payload.center);
      }),
    [],
  );

  const handleMoveEnd = useCallback(
    (payload: MovePayload) => {
      debouncedBoundsUpdate(payload);
    },
    [debouncedBoundsUpdate],
  );

  const toggleCategory = (category: string) => {
    if (!taxonomyTier3Set.has(category)) return;
    setSelectedCategories((prev) => {
      const exists = prev.includes(category);
      const next = exists ? prev.filter((value) => value !== category) : [...prev, category];
      trackTaxonomyToggle({
        tier3Id: category,
        active: !exists,
        selectionCount: next.length,
        platform: "web",
        surface: "places",
        city: city.slug,
      });
      return next;
    });
  };

  const selectedCategoryLabels = useMemo(
    () => selectedCategories.map((id) => tier3ById.get(id)?.label).filter(Boolean) as string[],
    [selectedCategories, tier3ById],
  );

  const selectionSummary = useMemo(() => {
    if (!selectedCategoryLabels.length) return "Showing all categories";
    const limit = 3;
    const preview = selectedCategoryLabels.slice(0, limit).join(", ");
    const remainder = selectedCategoryLabels.length - limit;
    return remainder > 0 ? `${preview} +${remainder} more` : preview;
  }, [selectedCategoryLabels]);

  const lastTrackedSelection = useRef<string | null>(null);

  useEffect(() => {
    const applied = categoriesForQuery ?? [];
    const key = `${city.slug}:${applied.join(",")}`;
    if (lastTrackedSelection.current === key) return;
    lastTrackedSelection.current = key;
    trackTaxonomyFiltersApplied({
      tier3Ids: applied,
      platform: "web",
      surface: "places",
      city: city.slug,
    });
  }, [categoriesForQuery, city.slug]);

  const handlePlaceSelect = (place: PlaceSummary) => {
    setSelectedPlaceId(place.id);
  };

  const emptyState = !placesQuery.isLoading && places.length === 0;

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Discover Places</h1>
          <p className="text-sm text-slate-600">
            Explore reliable venues sourced from OpenStreetMap and Foursquare. Move the map to refresh the list for your viewport.
          </p>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">{city.label}</p>
        </div>
        {citySwitcherEnabled ? (
          <div className="flex items-center gap-2">
            <label htmlFor="city-select" className="text-xs font-semibold uppercase text-slate-500">
              City
            </label>
            <select
              id="city-select"
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 shadow-sm hover:border-slate-400"
              value={citySlug}
              onChange={(event) => setCitySlug(event.target.value)}
            >
              {availableCities.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      {!hasLocationFix ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 shadow-sm">
          {city.label}. Enable location access to personalise nearby results.
        </div>
      ) : null}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-inner">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Filter by activity type</p>
            <p className="text-sm text-slate-500">Pick one or more taxonomy categories to narrow the map results.</p>
          </div>
          <span className="text-sm font-medium text-slate-600">{selectionSummary}</span>
        </div>
        <TaxonomyCategoryPicker taxonomy={discoveryTaxonomy} selectedIds={selectedCategories} onToggle={toggleCategory} />
      </div>
      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-h-[320px] rounded-xl border border-slate-200 shadow-sm">
          <PlacesMap
            center={center}
            places={places}
            selectedPlaceId={selectedPlaceId}
            onMoveEnd={({ bounds: nextBounds, center: nextCenter }) => handleMoveEnd({ bounds: nextBounds, center: nextCenter })}
            onSelectPlace={handlePlaceSelect}
          />
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Places in view</h2>
            {placesQuery.isLoading ? <span className="text-xs text-slate-500">Loading…</span> : null}
          </div>
          <div className="flex-1 overflow-y-auto">
            {emptyState ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-slate-600">
                <p>No places yet in this area.</p>
                <div className="flex flex-col gap-2">
                  <Link
                    href={"/create" as Route}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700"
                  >
                    Create an activity at this place
                  </Link>
                  <a
                    href="mailto:places@dowhat.com?subject=Place%20suggestion"
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
                  >
                    Suggest a place
                  </a>
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {places.map((place) => {
                  const isSelected = place.id === selectedPlaceId;
                  return (
                    <li
                      key={place.id}
                      className={`cursor-pointer rounded-lg border px-3 py-2 transition ${
                        isSelected ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300"
                      }`}
                      onClick={() => handlePlaceSelect(place)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-base font-semibold text-slate-900">{place.name}</div>
                          {place.address ? <div className="text-sm text-slate-600">{place.address}</div> : null}
                        </div>
                        {place.rating ? (
                          <div className="text-right text-sm text-emerald-700">
                            <div className="font-semibold">{place.rating.toFixed(1)}</div>
                            <div className="text-xs text-slate-500">{place.ratingCount ?? 0} reviews</div>
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1 text-xs text-slate-600">
                        {place.categories.slice(0, 4).map((category) => (
                          <span key={category} className="rounded-full bg-slate-100 px-2 py-0.5">
                            {category.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{formatPlaceUpdatedLabel(place)}</div>
                      {place.popularityScore ? (
                        <div className="mt-1 text-xs text-slate-500">Popularity score: {place.popularityScore.toFixed(2)}</div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {attributions.length ? (
              <div>
                Data sources:&nbsp;
                {attributions.map((attr, index) => (
                  <span key={`${attr.text}-${index}`}>
                    {attr.url ? (
                      <a href={attr.url} className="text-emerald-700 hover:underline" target="_blank" rel="noreferrer">
                        {attr.text}
                      </a>
                    ) : (
                      attr.text
                    )}
                    {attr.license ? ` (${attr.license})` : null}
                    {index < attributions.length - 1 ? ", " : null}
                  </span>
                ))}
              </div>
            ) : (
              <span>Data from OpenStreetMap and Foursquare Places.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
