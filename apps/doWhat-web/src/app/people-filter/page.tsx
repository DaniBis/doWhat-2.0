'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import {
  ACTIVITY_DISTANCE_OPTIONS,
  ACTIVITY_PRICE_FILTER_OPTIONS,
  ACTIVITY_TIME_FILTER_OPTIONS,
  DEFAULT_ACTIVITY_FILTER_PREFERENCES,
  DEFAULT_PEOPLE_FILTER_PREFERENCES,
  activityTaxonomy,
  canonicaliseTimeOfDayValues,
  countActiveActivityFilters,
  countActivePeopleFilters,
  derivePendingOnboardingSteps,
  isPlayStyle,
  isSportType,
  ONBOARDING_TRAIT_GOAL,
  loadUserPreference,
  normaliseActivityFilterPreferences,
  normalisePeopleFilterPreferences,
  resolvePriceKeyFromRange,
  resolvePriceRangeForKey,
  saveUserPreference,
  trackOnboardingEntry,
  type ActivityFilterPreferences,
  type ActivityPriceFilterKey,
  type ActivityTimeFilterKey,
  type PeopleFilterPreferences,
  type PlayStyle,
  type SportType,
  type OnboardingStep,
  PEOPLE_FILTER_AGE_RANGES,
  PEOPLE_FILTER_GROUP_SIZES,
  PEOPLE_FILTER_SKILL_LEVELS,
} from '@dowhat/shared';

import { supabase } from '@/lib/supabase/browser';
import TaxonomyCategoryPicker from '@/components/TaxonomyCategoryPicker';

type UserTrait = {
  trait_name: string;
  icon: string;
  color: string;
  count: number;
};

const FALLBACK_TRAITS: ReadonlyArray<{ trait_name: string; icon: string; color: string }> = [
  { trait_name: 'Early Bird', icon: '🌅', color: '#F59E0B' },
  { trait_name: 'Night Owl', icon: '🦉', color: '#7C3AED' },
  { trait_name: 'Social Butterfly', icon: '🦋', color: '#EC4899' },
  { trait_name: 'Adventure Seeker', icon: '🏔️', color: '#059669' },
  { trait_name: 'Fitness Enthusiast', icon: '💪', color: '#DC2626' },
  { trait_name: 'Foodie', icon: '🍕', color: '#EA580C' },
  { trait_name: 'Art Lover', icon: '🎨', color: '#9333EA' },
  { trait_name: 'Music Fan', icon: '🎵', color: '#0EA5E9' },
  { trait_name: 'Tech Geek', icon: '💻', color: '#059669' },
];

type PopularTraitResponse = {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  score: number;
  voteCount: number;
  baseCount: number;
  popularity: number;
};

const TRAIT_ICON_EMOJI_MAP: Record<string, string> = {
  Sparkles: '✨',
  Megaphone: '📣',
  Users: '🤝',
  Lotus: '🪷',
  Compass: '🧭',
  Target: '🎯',
  Gamepad2: '🎮',
  ClipboardCheck: '✅',
  Smile: '😊',
  Shuffle: '🔀',
  ShieldCheck: '🛡️',
};

const resolveTraitEmoji = (icon?: string | null): string => {
  if (!icon) return '✨';
  const trimmed = icon.trim();
  return TRAIT_ICON_EMOJI_MAP[trimmed] ?? (trimmed.length === 1 ? trimmed : '✨');
};

const buildFallbackTraitCounts = (): UserTrait[] =>
  FALLBACK_TRAITS.map((trait, index) => ({
    trait_name: trait.trait_name,
    icon: trait.icon,
    color: trait.color,
    count: 12 + index * 3,
  }));

const ACTIVITY_LOCAL_KEY = 'activity_filters:v1';
const PEOPLE_LOCAL_KEY = 'people_filters:v1';

type PeopleArrayKeys = 'personalityTraits' | 'skillLevels' | 'ageRanges' | 'groupSizePreference';

export default function PeopleFilterPage() {
  const [activityFilters, setActivityFilters] = useState<ActivityFilterPreferences>(
    DEFAULT_ACTIVITY_FILTER_PREFERENCES,
  );
  const [peopleFilters, setPeopleFilters] = useState<PeopleFilterPreferences>(
    DEFAULT_PEOPLE_FILTER_PREFERENCES,
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [baseTraitCount, setBaseTraitCount] = useState<number | null>(null);
  const [pledgeAckAt, setPledgeAckAt] = useState<string | null>(null);
  const [, setPledgeVersion] = useState<string | null>(null);
  const [pledgeHydrated, setPledgeHydrated] = useState(false);
  const [primarySport, setPrimarySport] = useState<SportType | null>(null);
  const [playStyle, setPlayStyle] = useState<PlayStyle | null>(null);
  const [sportSkillLevel, setSportSkillLevel] = useState<string | null>(null);
  const [sportProfileLoading, setSportProfileLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'activities' | 'people'>('people');
  const [nearbyTraits, setNearbyTraits] = useState<UserTrait[]>([]);

  const traitCountLoading = baseTraitCount === null;
  const rawPendingOnboardingSteps = useMemo<OnboardingStep[]>(
    () =>
      derivePendingOnboardingSteps({
        traitCount: typeof baseTraitCount === 'number' ? baseTraitCount : undefined,
        primarySport,
        playStyle,
        skillLevel: sportSkillLevel,
        pledgeAckAt,
      }),
    [baseTraitCount, playStyle, primarySport, sportSkillLevel, pledgeAckAt],
  );
  const pendingOnboardingSteps = useMemo<OnboardingStep[]>(
    () =>
      rawPendingOnboardingSteps.filter((step) => {
        if (step === 'traits') {
          return !traitCountLoading && baseTraitCount != null;
        }
        if (step === 'sport') {
          return !sportProfileLoading;
        }
        if (step === 'pledge') {
          return pledgeHydrated;
        }
        return true;
      }),
    [rawPendingOnboardingSteps, traitCountLoading, baseTraitCount, sportProfileLoading, pledgeHydrated],
  );
  const pendingOnboardingCount = pendingOnboardingSteps.length;
  const needsTraitOnboarding = pendingOnboardingSteps.includes('traits');
  const needsSportOnboarding = pendingOnboardingSteps.includes('sport');
  const needsReliabilityPledge = pendingOnboardingSteps.includes('pledge');
  const traitShortfall = needsTraitOnboarding
    ? Math.max(1, ONBOARDING_TRAIT_GOAL - (baseTraitCount ?? 0))
    : 0;

  const normaliseWithCanonicalTime = useCallback(
    (prefs: ActivityFilterPreferences): ActivityFilterPreferences =>
      normaliseActivityFilterPreferences({
        ...prefs,
        timeOfDay: canonicaliseTimeOfDayValues(prefs.timeOfDay ?? []),
      }),
    [],
  );

  useEffect(() => {
    fetchNearbyTraits();
  }, [normaliseWithCanonicalTime]);

  useEffect(() => {
    let cancelled = false;

    const readLocalActivity = (): ActivityFilterPreferences | null => {
      if (typeof window === 'undefined') return null;
      try {
        const raw = window.localStorage.getItem(ACTIVITY_LOCAL_KEY);
        if (!raw) return null;
        return normaliseWithCanonicalTime(JSON.parse(raw) as ActivityFilterPreferences);
      } catch (error) {
        console.warn('[people-filters] failed to parse cached activity filters', error);
        return null;
      }
    };

    const readLocalPeople = (): PeopleFilterPreferences | null => {
      if (typeof window === 'undefined') return null;
      try {
        const raw = window.localStorage.getItem(PEOPLE_LOCAL_KEY);
        if (!raw) return null;
        return normalisePeopleFilterPreferences(JSON.parse(raw) as PeopleFilterPreferences);
      } catch (error) {
        console.warn('[people-filters] failed to parse cached people filters', error);
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
            const [remoteActivity, remotePeople] = await Promise.all([
              loadUserPreference<ActivityFilterPreferences>(supabase, user.id, 'activity_filters'),
              loadUserPreference<PeopleFilterPreferences>(supabase, user.id, 'people_filters'),
            ]);
            if (!cancelled) {
              if (remoteActivity) {
                setActivityFilters(normaliseWithCanonicalTime(remoteActivity));
              } else {
                const fallback = readLocalActivity();
                if (fallback) setActivityFilters(fallback);
              }
              if (remotePeople) {
                setPeopleFilters(normalisePeopleFilterPreferences(remotePeople));
              } else {
                const fallback = readLocalPeople();
                if (fallback) setPeopleFilters(fallback);
              }
            }
            return;
          } catch (error) {
            console.warn('[people-filters] failed to load remote preferences', error);
          }
        }

        if (!cancelled) {
          const localActivity = readLocalActivity();
          if (localActivity) setActivityFilters(localActivity);
          const localPeople = readLocalPeople();
          if (localPeople) setPeopleFilters(localPeople);
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadTraitCount = async (uid: string) => {
      const { count, error } = await supabase
        .from('user_base_traits')
        .select('trait_id', { count: 'exact', head: true })
        .eq('user_id', uid);
      if (!cancelled) {
        if (error) {
          console.warn('[people-filters] failed to fetch base traits', error);
          setBaseTraitCount(0);
        } else {
          setBaseTraitCount(typeof count === 'number' ? count : 0);
        }
      }
    };

    if (!userId) {
      setBaseTraitCount(null);
      return () => {
        cancelled = true;
      };
    }

    loadTraitCount(userId);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setPrimarySport(null);
      setPlayStyle(null);
      setSportSkillLevel(null);
      setSportProfileLoading(false);
      return () => {
        /* noop */
      };
    }
    let cancelled = false;
    setSportProfileLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('primary_sport, play_style')
          .eq('id', userId)
          .maybeSingle<{ primary_sport: string | null; play_style: string | null }>();
        if (error && error.code !== 'PGRST116') {
          throw error;
        }
        const normalizedSport = data?.primary_sport && isSportType(data.primary_sport)
          ? data.primary_sport
          : null;
        const normalizedPlayStyle = data?.play_style && isPlayStyle(data.play_style)
          ? data.play_style
          : null;
        let skillLevel: string | null = null;
        if (normalizedSport) {
          const { data: sportRow, error: sportError } = await supabase
            .from('user_sport_profiles')
            .select('skill_level')
            .eq('user_id', userId)
            .eq('sport', normalizedSport)
            .maybeSingle<{ skill_level: string | null }>();
          if (sportError && sportError.code !== 'PGRST116') {
            throw sportError;
          }
          skillLevel = sportRow?.skill_level ?? null;
        }
        if (!cancelled) {
          setPrimarySport(normalizedSport);
          setPlayStyle(normalizedPlayStyle);
          setSportSkillLevel(skillLevel);
        }
      } catch (error) {
        console.warn('[people-filters] failed to load sport profile', error);
        if (!cancelled) {
          setPrimarySport(null);
          setPlayStyle(null);
          setSportSkillLevel(null);
        }
      } finally {
        if (!cancelled) {
          setSportProfileLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setPledgeAckAt(null);
      setPledgeVersion(null);
      setPledgeHydrated(true);
      return () => {
        cancelled = true;
      };
    }

    setPledgeHydrated(false);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('reliability_pledge_ack_at, reliability_pledge_version')
          .eq('id', userId)
          .maybeSingle<{ reliability_pledge_ack_at: string | null; reliability_pledge_version: string | null }>();
        if (cancelled) return;
        if (error && error.code !== 'PGRST116') {
          throw error;
        }
        setPledgeAckAt(data?.reliability_pledge_ack_at ?? null);
        setPledgeVersion(data?.reliability_pledge_version ?? null);
      } catch (error) {
        console.warn('[people-filters] failed to fetch reliability pledge state', error);
        if (!cancelled) {
          setPledgeAckAt(null);
          setPledgeVersion(null);
        }
      } finally {
        if (!cancelled) {
          setPledgeHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persistActivity = useCallback(
    async (next: ActivityFilterPreferences) => {
      const normalised = normaliseWithCanonicalTime(next);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(ACTIVITY_LOCAL_KEY, JSON.stringify(normalised));
        } catch (error) {
          console.warn('[people-filters] unable to cache activity filters locally', error);
        }
      }
      if (userId) {
        try {
          await saveUserPreference(supabase, userId, 'activity_filters', normalised);
        } catch (error) {
          console.warn('[people-filters] failed to persist activity filters remotely', error);
        }
      }
    },
    [normaliseWithCanonicalTime, userId],
  );

  const persistPeople = useCallback(
    async (next: PeopleFilterPreferences) => {
      const normalised = normalisePeopleFilterPreferences(next);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(PEOPLE_LOCAL_KEY, JSON.stringify(normalised));
        } catch (error) {
          console.warn('[people-filters] unable to cache people filters locally', error);
        }
      }
      if (userId) {
        try {
          await saveUserPreference(supabase, userId, 'people_filters', normalised);
        } catch (error) {
          console.warn('[people-filters] failed to persist people filters remotely', error);
        }
      }
    },
    [userId],
  );

  useEffect(() => {
    if (!initialised) return;
    void persistActivity(activityFilters);
  }, [activityFilters, initialised, persistActivity]);

  useEffect(() => {
    if (!initialised) return;
    void persistPeople(peopleFilters);
  }, [peopleFilters, initialised, persistPeople]);

  const updateActivityFilters = useCallback(
    (updater: (prev: ActivityFilterPreferences) => ActivityFilterPreferences) => {
      setActivityFilters((prev) => normaliseWithCanonicalTime(updater(prev)));
    },
    [normaliseWithCanonicalTime],
  );

  const updatePeopleFilters = useCallback(
    (updater: (prev: PeopleFilterPreferences) => PeopleFilterPreferences) => {
      setPeopleFilters((prev) => normalisePeopleFilterPreferences(updater(prev)));
    },
    [],
  );

  const fetchNearbyTraits = async () => {
    try {
      const response = await fetch('/api/traits/popular?limit=12', { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`Failed to load traits (${response.status})`);
      }
      const payload = (await response.json()) as PopularTraitResponse[];
      if (!Array.isArray(payload) || payload.length === 0) {
        setNearbyTraits(buildFallbackTraitCounts());
        return;
      }
      const mapped = payload.map((trait, index) => {
        const rawCount = trait.popularity || trait.voteCount || trait.baseCount || trait.score || 1;
        return {
          trait_name: trait.name ?? `Trait ${index + 1}`,
          icon: resolveTraitEmoji(trait.icon),
          color: trait.color ?? FALLBACK_TRAITS[index % FALLBACK_TRAITS.length]?.color ?? '#0EA5E9',
          count: Math.max(1, Math.round(rawCount)),
        };
      });
      setNearbyTraits(mapped.sort((a, b) => b.count - a.count));
    } catch (error) {
      console.error('[people-filters] failed to load popular traits', error);
      setNearbyTraits(buildFallbackTraitCounts());
    }
  };

  const toggleCategory = useCallback(
    (categoryId: string) => {
      updateActivityFilters((prev) => {
        const exists = prev.categories.includes(categoryId);
        return {
          ...prev,
          categories: exists
            ? prev.categories.filter((item) => item !== categoryId)
            : [...prev.categories, categoryId],
        };
      });
    },
    [updateActivityFilters],
  );

  const toggleTimeSlot = useCallback(
    (timeKey: ActivityTimeFilterKey) => {
      const slot = ACTIVITY_TIME_FILTER_OPTIONS.find((option) => option.key === timeKey);
      if (!slot) return;
      updateActivityFilters((prev) => {
        if (!slot.value) {
          return { ...prev, timeOfDay: [] };
        }
        const exists = prev.timeOfDay.includes(slot.value);
        const next = exists
          ? prev.timeOfDay.filter((value) => value !== slot.value)
          : [...prev.timeOfDay, slot.value];
        return { ...prev, timeOfDay: next };
      });
    },
    [updateActivityFilters],
  );

  const togglePeopleFilterArray = useCallback(
    (category: PeopleArrayKeys, value: string) => {
      updatePeopleFilters((prev) => ({
        ...prev,
        [category]: prev[category].includes(value)
          ? prev[category].filter((item: string) => item !== value)
          : [...prev[category], value],
      }));
    },
    [updatePeopleFilters],
  );

  const handleDistanceSelect = useCallback(
    (radius: number) => {
      updateActivityFilters((prev) => ({
        ...prev,
        radius,
      }));
    },
    [updateActivityFilters],
  );

  const pricePresetKey = useMemo<ActivityPriceFilterKey>(
    () => resolvePriceKeyFromRange(activityFilters.priceRange),
    [activityFilters.priceRange],
  );

  const handlePricePreset = useCallback(
    (preset: ActivityPriceFilterKey) => {
      updateActivityFilters((prev) => ({
        ...prev,
        priceRange: resolvePriceRangeForKey(preset),
      }));
    },
    [updateActivityFilters],
  );

  const handlePriceInputChange = useCallback(
    (bound: 'min' | 'max', value: number) => {
      if (!Number.isFinite(value)) return;
      updateActivityFilters((prev) => {
        if (bound === 'min') {
          const nextMin = Math.max(0, value);
          return {
            ...prev,
            priceRange: [nextMin, Math.max(nextMin, prev.priceRange[1])],
          };
        }
        const nextMax = Math.max(prev.priceRange[0], value);
        return {
          ...prev,
          priceRange: [prev.priceRange[0], nextMax],
        };
      });
    },
    [updateActivityFilters],
  );

  const clearAllFilters = () => {
    updateActivityFilters(() => DEFAULT_ACTIVITY_FILTER_PREFERENCES);
    updatePeopleFilters(() => DEFAULT_PEOPLE_FILTER_PREFERENCES);
  };

  const applyFilters = () => {
    console.log('Applying filters:', {
      activity: activityFilters,
      people: peopleFilters,
    });
    window.history.back();
  };

  const activeFiltersCount = useMemo(
    () => countActiveActivityFilters(activityFilters) + countActivePeopleFilters(peopleFilters),
    [activityFilters, peopleFilters],
  );

  const renderActivityFilters = () => (
    <div className="space-y-8">
      {/* Activity Categories */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Activity Categories</h3>
        <p className="text-sm text-gray-500 mb-4">
          Browse the shared taxonomy so discovery filters stay aligned with the main Activity Filters page.
        </p>
        <TaxonomyCategoryPicker
          taxonomy={activityTaxonomy}
          selectedIds={activityFilters.categories}
          onToggle={toggleCategory}
        />
      </div>

      {/* Time of Day */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Time Preference</h3>
        <div className="space-y-2">
          {ACTIVITY_TIME_FILTER_OPTIONS.map((slot) => {
            const isActive = slot.value
              ? activityFilters.timeOfDay.includes(slot.value)
              : activityFilters.timeOfDay.length === 0;
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

      {/* Distance & Price */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Distance & Budget</h3>
        <div className="space-y-6">
          <div>
            <p className="text-sm text-gray-600 mb-3">Select how far you’re willing to travel.</p>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_DISTANCE_OPTIONS.map((radius) => (
                <button
                  key={radius}
                  onClick={() => handleDistanceSelect(radius)}
                  className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                    activityFilters.radius === radius
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-blue-500 hover:text-blue-500'
                  }`}
                >
                  {radius} mi
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex flex-col gap-4">
              <div>
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
                <p className="text-sm text-gray-500 mt-3">
                  Current range: ${activityFilters.priceRange[0]} – ${activityFilters.priceRange[1]}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm text-gray-600">Min ($)</label>
                  <input
                    type="number"
                    value={activityFilters.priceRange[0]}
                    onChange={(e) => handlePriceInputChange('min', Number(e.target.value))}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Max ($)</label>
                  <input
                    type="number"
                    value={activityFilters.priceRange[1]}
                    onChange={(e) => handlePriceInputChange('max', Number(e.target.value))}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPeopleFilters = () => (
    <div className="space-y-8">
      {/* Popular Traits in Your Area */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Popular Personality Traits Nearby</h3>
        <p className="text-gray-600 mb-6">Find people who share these traits</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {nearbyTraits.map((trait) => (
            <button
              key={trait.trait_name}
              className={`p-4 rounded-lg border-2 text-center transition-all ${
                peopleFilters.personalityTraits.includes(trait.trait_name)
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-blue-300'
              }`}
              onClick={() => togglePeopleFilterArray('personalityTraits', trait.trait_name)}
            >
              <div className="text-2xl mb-2">{trait.icon}</div>
              <div className={`font-medium text-sm mb-1 ${
                peopleFilters.personalityTraits.includes(trait.trait_name) ? 'text-blue-700' : 'text-gray-900'
              }`}>
                {trait.trait_name}
              </div>
              <div className="text-xs text-gray-500">{trait.count} people</div>
            </button>
          ))}
        </div>
      </div>

      {/* Skill Level */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Skill Level</h3>
        <div className="flex flex-wrap gap-2">
          {PEOPLE_FILTER_SKILL_LEVELS.map((level) => (
            <button
              key={level}
              className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                peopleFilters.skillLevels.includes(level)
                  ? 'bg-purple-500 border-purple-500 text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-purple-500 hover:text-purple-500'
              }`}
              onClick={() => togglePeopleFilterArray('skillLevels', level)}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Age Range */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Age Range</h3>
        <div className="flex flex-wrap gap-2">
          {PEOPLE_FILTER_AGE_RANGES.map((age) => (
            <button
              key={age}
              className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                peopleFilters.ageRanges.includes(age)
                  ? 'bg-green-500 border-green-500 text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-green-500 hover:text-green-500'
              }`}
              onClick={() => togglePeopleFilterArray('ageRanges', age)}
            >
              {age}
            </button>
          ))}
        </div>
      </div>

      {/* Group Size Preference */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Group Size Preference</h3>
        <div className="flex flex-wrap gap-2">
          {PEOPLE_FILTER_GROUP_SIZES.map((size) => (
            <button
              key={size}
              className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                peopleFilters.groupSizePreference.includes(size)
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-orange-500 hover:text-orange-500'
              }`}
              onClick={() => togglePeopleFilterArray('groupSizePreference', size)}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 via-blue-800 to-blue-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <Link 
              href="/" 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
            >
              ← Back
            </Link>
            <h1 className="text-2xl font-bold">Smart Filters</h1>
            <button 
              onClick={clearAllFilters}
              className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
            >
              Clear All
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2">
            <button
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'people'
                  ? 'bg-white text-gray-900'
                  : 'bg-white/20 text-white/80 hover:bg-white/30'
              }`}
              onClick={() => setActiveTab('people')}
            >
              👥 People Filter
            </button>
            
            <button
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'activities'
                  ? 'bg-white text-gray-900'
                  : 'bg-white/20 text-white/80 hover:bg-white/30'
              }`}
              onClick={() => setActiveTab('activities')}
            >
              🎯 Activity Filter
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {isLoading && (
          <div className="mb-6 text-sm text-gray-500">Loading your saved preferences…</div>
        )}
        {needsSportOnboarding && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-teal-200 bg-teal-50/80 p-4 text-sm text-teal-900">
            <div className="space-y-1">
              <p className="text-base font-semibold text-teal-900">Set your sport & skill</p>
              <p>
                Choose your primary sport, play style, and level so people filters can surface better matches.
              </p>
            </div>
            <Link
              href="/onboarding/sports"
              onClick={() =>
                trackOnboardingEntry({
                  source: 'people-filter-banner',
                  platform: 'web',
                  step: 'sport',
                  steps: pendingOnboardingSteps,
                  pendingSteps: pendingOnboardingCount,
                  nextStep: '/onboarding/sports',
                })
              }
              className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-teal-500"
            >
              Go to sport onboarding
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}
        {needsTraitOnboarding && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900">
            <div className="space-y-1">
              <p className="text-base font-semibold text-emerald-900">Finish your base traits</p>
              <p>
                Pick {traitShortfall} more trait{traitShortfall === 1 ? '' : 's'} to unlock personalized people filters and better trait hints.
              </p>
            </div>
            <Link
              href="/onboarding/traits"
              onClick={() =>
                trackOnboardingEntry({
                  source: 'people-filter-banner',
                  platform: 'web',
                  step: 'traits',
                  steps: pendingOnboardingSteps,
                  pendingSteps: pendingOnboardingCount,
                  nextStep: '/onboarding/traits',
                })
              }
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500"
            >
              Go to onboarding
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}
        {needsReliabilityPledge && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50/80 p-4 text-sm text-indigo-900">
            <div className="space-y-1">
              <p className="text-base font-semibold text-indigo-900">Confirm the reliability pledge</p>
              <p>
                Review the four doWhat commitments so hosts prioritize you for last-minute openings and high-reliability matches.
              </p>
            </div>
            <Link
              href="/onboarding/reliability-pledge"
              onClick={() =>
                trackOnboardingEntry({
                  source: 'people-filter-banner',
                  platform: 'web',
                  step: 'pledge',
                  steps: pendingOnboardingSteps,
                  pendingSteps: pendingOnboardingCount,
                  nextStep: '/onboarding/reliability-pledge',
                })
              }
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
            >
              Review pledge
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}
        {activeTab === 'people' ? renderPeopleFilters() : renderActivityFilters()}
      </div>

      {/* Apply Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
        <div className="max-w-7xl mx-auto">
          <button 
            onClick={applyFilters}
            disabled={isLoading}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 px-6 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            Apply {activeFiltersCount > 0 ? `${activeFiltersCount} ` : ''}Filters
          </button>
        </div>
      </div>

      {/* Spacer for fixed button */}
      <div className="h-20"></div>
    </div>
  );
}
