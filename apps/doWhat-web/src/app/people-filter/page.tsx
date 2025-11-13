'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';

import {
  DEFAULT_ACTIVITY_FILTER_PREFERENCES,
  DEFAULT_PEOPLE_FILTER_PREFERENCES,
  countActiveActivityFilters,
  countActivePeopleFilters,
  loadUserPreference,
  normaliseActivityFilterPreferences,
  normalisePeopleFilterPreferences,
  saveUserPreference,
  type ActivityFilterPreferences,
  type PeopleFilterPreferences,
} from '@dowhat/shared';

import { supabase } from '@/lib/supabase/browser';

type UserTrait = {
  trait_name: string;
  icon: string;
  color: string;
  count: number;
};

const availableTraits = [
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

const activityCategories = [
  'Fitness & Sports',
  'Arts & Culture',
  'Food & Drink',
  'Technology',
  'Outdoor Adventures',
  'Social Events',
  'Learning & Education',
  'Music & Entertainment',
];

const timeSlots = [
  'Early Morning (6-9 AM)',
  'Morning (9-12 PM)',
  'Afternoon (12-6 PM)',
  'Evening (6-9 PM)',
  'Night (9 PM+)',
];

const skillLevels = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
const ageRanges = ['18-25', '26-35', '36-45', '46-55', '55+'];
const groupSizes = ['1-5 people', '6-15 people', '16-30 people', '30+ people'];

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

  const [activeTab, setActiveTab] = useState<'activities' | 'people'>('people');
  const [nearbyTraits, setNearbyTraits] = useState<UserTrait[]>([]);

  useEffect(() => {
    fetchNearbyTraits();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const readLocalActivity = (): ActivityFilterPreferences | null => {
      if (typeof window === 'undefined') return null;
      try {
        const raw = window.localStorage.getItem(ACTIVITY_LOCAL_KEY);
        if (!raw) return null;
        return normaliseActivityFilterPreferences(JSON.parse(raw) as ActivityFilterPreferences);
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
                setActivityFilters(normaliseActivityFilterPreferences(remoteActivity));
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

  const persistActivity = useCallback(
    async (next: ActivityFilterPreferences) => {
      const normalised = normaliseActivityFilterPreferences(next);
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
    [userId],
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
      setActivityFilters((prev) => normaliseActivityFilterPreferences(updater(prev)));
    },
    [],
  );

  const updatePeopleFilters = useCallback(
    (updater: (prev: PeopleFilterPreferences) => PeopleFilterPreferences) => {
      setPeopleFilters((prev) => normalisePeopleFilterPreferences(updater(prev)));
    },
    [],
  );

  const fetchNearbyTraits = async () => {
    try {
      // For demo, simulate nearby trait data
      const traitCounts = availableTraits.map(trait => ({
        ...trait,
        count: Math.floor(Math.random() * 50) + 5,
      }));
      setNearbyTraits(traitCounts.sort((a, b) => b.count - a.count));
    } catch (error) {
      console.error('Error fetching nearby traits:', error);
    }
  };

  const toggleFilter = (
    category: 'categories' | 'timeOfDay' | PeopleArrayKeys,
    value: string,
  ) => {
    if (category === 'categories') {
      updateActivityFilters((prev) => ({
        ...prev,
        categories: prev.categories.includes(value)
          ? prev.categories.filter((item) => item !== value)
          : [...prev.categories, value],
      }));
      return;
    }
    if (category === 'timeOfDay') {
      updateActivityFilters((prev) => ({
        ...prev,
        timeOfDay: prev.timeOfDay.includes(value)
          ? prev.timeOfDay.filter((item) => item !== value)
          : [...prev.timeOfDay, value],
      }));
      return;
    }

    updatePeopleFilters((prev) => ({
      ...prev,
      [category]: prev[category].includes(value)
        ? prev[category].filter((item: string) => item !== value)
        : [...prev[category], value],
    }));
  };

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
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Categories</h3>
        <div className="flex flex-wrap gap-2">
          {activityCategories.map((category) => (
            <button
              key={category}
              className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                activityFilters.categories.includes(category)
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-blue-500 hover:text-blue-500'
              }`}
              onClick={() => toggleFilter('categories', category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Time of Day */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Time Preference</h3>
        <div className="flex flex-wrap gap-2">
          {timeSlots.map((time) => (
            <button
              key={time}
              className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                activityFilters.timeOfDay.includes(time)
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-blue-500 hover:text-blue-500'
              }`}
              onClick={() => toggleFilter('timeOfDay', time)}
            >
              {time}
            </button>
          ))}
        </div>
      </div>

      {/* Distance & Price */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Distance & Budget</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900">Distance: {activityFilters.radius} miles</span>
              <div className="flex gap-2">
                <button 
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
                  onClick={() =>
                    updateActivityFilters((prev) => ({
                      ...prev,
                      radius: Math.max(1, prev.radius - 5),
                    }))
                  }
                >
                  -
                </button>
                <button 
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
                  onClick={() =>
                    updateActivityFilters((prev) => ({
                      ...prev,
                      radius: Math.min(50, prev.radius + 5),
                    }))
                  }
                >
                  +
                </button>
              </div>
            </div>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="font-medium text-gray-900 mb-1">Budget: ${activityFilters.priceRange[0]} - ${activityFilters.priceRange[1]}</div>
            <div className="text-sm text-gray-500">Click to adjust price range</div>
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
              onClick={() => toggleFilter('personalityTraits', trait.trait_name)}
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
          {skillLevels.map((level) => (
            <button
              key={level}
              className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                peopleFilters.skillLevels.includes(level)
                  ? 'bg-purple-500 border-purple-500 text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-purple-500 hover:text-purple-500'
              }`}
              onClick={() => toggleFilter('skillLevels', level)}
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
          {ageRanges.map((age) => (
            <button
              key={age}
              className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                peopleFilters.ageRanges.includes(age)
                  ? 'bg-green-500 border-green-500 text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-green-500 hover:text-green-500'
              }`}
              onClick={() => toggleFilter('ageRanges', age)}
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
          {groupSizes.map((size) => (
            <button
              key={size}
              className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                peopleFilters.groupSizePreference.includes(size)
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-orange-500 hover:text-orange-500'
              }`}
              onClick={() => toggleFilter('groupSizePreference', size)}
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
