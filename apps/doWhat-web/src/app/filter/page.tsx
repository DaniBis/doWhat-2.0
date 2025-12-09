'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import {
  ACTIVITY_DISTANCE_OPTIONS,
  ACTIVITY_PRICE_FILTER_OPTIONS,
  ACTIVITY_TIME_FILTER_OPTIONS,
  DEFAULT_ACTIVITY_FILTER_PREFERENCES,
  DEFAULT_ACTIVITY_PRICE_RANGE,
  DEFAULT_ACTIVITY_RADIUS,
  activityTaxonomy,
  canonicaliseTimeOfDayValues,
  countActiveActivityFilters,
  defaultTier3Index,
  loadUserPreference,
  normaliseActivityFilterPreferences,
  resolvePriceKeyFromRange,
  resolvePriceRangeForKey,
  saveUserPreference,
  type ActivityFilterPreferences,
  type ActivityPriceFilterKey,
  type ActivityTier3WithAncestors,
  type ActivityTimeFilterKey,
} from '@dowhat/shared';

import { supabase } from '@/lib/supabase/browser';
import TaxonomyCategoryPicker from '@/components/TaxonomyCategoryPicker';

const LOCAL_STORAGE_KEY = 'activity_filters:v1';

export default function FilterPage() {
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ActivityFilterPreferences>(
    DEFAULT_ACTIVITY_FILTER_PREFERENCES,
  );
  const [from, setFrom] = useState<string>('');
  const [initialised, setInitialised] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setFrom(searchParams.get('from') || '');
  }, [searchParams]);

  const normaliseWithCanonicalTime = useCallback(
    (prefs: ActivityFilterPreferences): ActivityFilterPreferences => {
      return normaliseActivityFilterPreferences({
        ...prefs,
        timeOfDay: canonicaliseTimeOfDayValues(prefs.timeOfDay ?? []),
      });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const readLocal = (): ActivityFilterPreferences | null => {
      if (typeof window === 'undefined') return null;
      try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as ActivityFilterPreferences;
        return normaliseWithCanonicalTime(parsed);
      } catch (error) {
        console.warn('[activity-filters] unable to parse cached preferences', error);
        return null;
      }
    };

    const bootstrap = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        const user = data.user ?? null;
        setUserId(user?.id ?? null);

        if (user?.id) {
          try {
            const remote = await loadUserPreference<ActivityFilterPreferences>(
              supabase,
              user.id,
              'activity_filters',
            );
            if (!cancelled && remote) {
              setFilters(normaliseWithCanonicalTime(remote));
              return;
            }
          } catch (error) {
            console.warn('[activity-filters] failed to load remote preferences', error);
          }
        }

        const local = readLocal();
        if (!cancelled && local) {
          setFilters(local);
        }
      } finally {
        if (!cancelled) {
          setInitialised(true);
          setIsLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [normaliseWithCanonicalTime]);

  const persistPreferences = useCallback(
    async (next: ActivityFilterPreferences) => {
      const normalised = normaliseWithCanonicalTime(next);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalised));
        } catch (error) {
          console.warn('[activity-filters] unable to cache preferences locally', error);
        }
      }
      if (userId) {
        try {
          await saveUserPreference(supabase, userId, 'activity_filters', normalised);
        } catch (error) {
          console.warn('[activity-filters] failed to persist remote preferences', error);
        }
      }
    },
    [normaliseWithCanonicalTime, userId],
  );

  useEffect(() => {
    if (!initialised) return;
    void persistPreferences(filters);
  }, [filters, initialised, persistPreferences]);

  const updateFilters = useCallback(
    (updater: (prev: ActivityFilterPreferences) => ActivityFilterPreferences) => {
      setFilters((prev) => normaliseWithCanonicalTime(updater(prev)));
    },
    [normaliseWithCanonicalTime],
  );

  const tier3Index = useMemo(() => {
    const index = new Map<string, ActivityTier3WithAncestors>();
    defaultTier3Index.forEach((entry) => {
      index.set(entry.id, entry);
    });
    return index;
  }, []);

  const pricePresetKey = useMemo(
    () => resolvePriceKeyFromRange(filters.priceRange),
    [filters.priceRange],
  );

  const handlePricePreset = useCallback(
    (preset: ActivityPriceFilterKey) => {
      updateFilters((prev) => ({
        ...prev,
        priceRange: resolvePriceRangeForKey(preset),
      }));
    },
    [updateFilters],
  );

  const toggleCategory = (categoryId: string) => {
    updateFilters((prev) => ({
      ...prev,
      categories: prev.categories.includes(categoryId)
        ? prev.categories.filter((id) => id !== categoryId)
        : [...prev.categories, categoryId],
    }));
  };

  const toggleTimeSlot = (timeKey: ActivityTimeFilterKey) => {
    const slot = ACTIVITY_TIME_FILTER_OPTIONS.find((option) => option.key === timeKey);
    if (!slot) return;
    updateFilters((prev) => {
      if (!slot.value) {
        return { ...prev, timeOfDay: [] };
      }
      const exists = prev.timeOfDay.includes(slot.value);
      const next = exists
        ? prev.timeOfDay.filter((value) => value !== slot.value)
        : [...prev.timeOfDay, slot.value];
      return { ...prev, timeOfDay: next };
    });
  };

  const resetFilters = () => {
    updateFilters(() => DEFAULT_ACTIVITY_FILTER_PREFERENCES);
  };

  const activeFiltersCount = useMemo(() => countActiveActivityFilters(filters), [filters]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-gray-600 hover:text-gray-900">
                ← Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Activity Filters</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Current Filters Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Filters</h2>
          {isLoading && (
            <p className="mb-4 text-xs text-gray-500">Loading your saved preferences…</p>
          )}
          {activeFiltersCount === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">⚙️</div>
              <p className="text-gray-600 font-medium">No filters applied</p>
              <p className="text-gray-500 text-sm mt-1">
                Use the options below to customize your search
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filters.radius !== DEFAULT_ACTIVITY_RADIUS && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  📍 {filters.radius} miles
                </span>
              )}
              {(filters.priceRange[0] !== DEFAULT_ACTIVITY_PRICE_RANGE[0] ||
                filters.priceRange[1] !== DEFAULT_ACTIVITY_PRICE_RANGE[1]) && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  💰 ${filters.priceRange[0]} - ${filters.priceRange[1]}
                </span>
              )}
              {filters.categories.map((categoryId) => {
                const category = tier3Index.get(categoryId);
                return category ? (
                  <span
                    key={categoryId}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800"
                  >
                    {category.tier1Label} • {category.label}
                  </span>
                ) : null;
              })}
              {filters.timeOfDay.map((timeValue) => {
                const slot = ACTIVITY_TIME_FILTER_OPTIONS.find(
                  (option) => option.value === timeValue || option.aliases?.includes(timeValue),
                );
                return (
                  <span
                    key={timeValue}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800"
                  >
                    {slot?.icon ?? '🕒'} {slot?.label ?? timeValue}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Distance Radius */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Distance Radius</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Current: {filters.radius} miles</span>
                <div className="flex space-x-2">
                  {ACTIVITY_DISTANCE_OPTIONS.map((radius) => (
                    <button
                      key={radius}
                      onClick={() => updateFilters((prev) => ({ ...prev, radius }))}
                      className={`px-3 py-1 rounded-md text-sm font-medium ${
                        filters.radius === radius
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {radius}mi
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Price Range */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Price Range</h3>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {ACTIVITY_PRICE_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => handlePricePreset(option.key)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      pricePresetKey === option.key
                        ? 'border-green-500 bg-green-50 text-green-800'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <label className="block text-sm text-gray-600">Min ($)</label>
                  <input
                    type="number"
                    value={filters.priceRange[0]}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      const nextMin = Number.isFinite(raw) ? raw : 0;
                      updateFilters((prev) => ({
                        ...prev,
                        priceRange: [nextMin, prev.priceRange[1]],
                      }));
                    }}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-gray-600">Max ($)</label>
                  <input
                    type="number"
                    value={filters.priceRange[1]}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      updateFilters((prev) => {
                        const nextMax = Number.isFinite(raw) ? raw : prev.priceRange[0];
                        return {
                          ...prev,
                          priceRange: [prev.priceRange[0], nextMax],
                        };
                      });
                    }}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Categories */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900">Categories</h3>
            <p className="text-sm text-gray-500 mb-4">
              Browse the shared taxonomy so discovery filters stay consistent across web and mobile.
            </p>
            <TaxonomyCategoryPicker
              taxonomy={activityTaxonomy}
              selectedIds={filters.categories}
              onToggle={toggleCategory}
            />
          </div>

          {/* Time of Day */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Time of Day</h3>
            <div className="space-y-2">
              {ACTIVITY_TIME_FILTER_OPTIONS.map((slot) => {
                const isActive = slot.value
                  ? filters.timeOfDay.includes(slot.value)
                  : filters.timeOfDay.length === 0;
                return (
                  <button
                    key={slot.key}
                    onClick={() => toggleTimeSlot(slot.key)}
                    className={`w-full p-3 rounded-lg border text-left transition-colors ${
                      isActive
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center">
                      {slot.icon && <span className="text-xl mr-3">{slot.icon}</span>}
                      <span className="font-medium">{slot.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center mt-8 p-6 bg-white rounded-xl shadow-sm border border-gray-200">
          <button
            onClick={resetFilters}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
          >
            Reset All
          </button>
          <div className="flex space-x-4">
            <Link
              href="/"
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
            >
              Cancel
            </Link>
            <Link
              href={{
                pathname: from === 'map' ? '/map' : '/',
                query: {
                  radius: Math.round(filters.radius * 1609),
                  types: filters.categories.join(','),
                  time: filters.timeOfDay.join(','),
                  price_min: filters.priceRange[0],
                  price_max: filters.priceRange[1]
                }
              }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Apply Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
