'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type FilterOptions = {
  radius: number;
  priceRange: [number, number];
  categories: string[];
  timeOfDay: string[];
};

const categories = [
  { id: 'fitness', name: 'Fitness', icon: '💪' },
  { id: 'food', name: 'Food & Drink', icon: '🍽️' },
  { id: 'arts', name: 'Arts & Culture', icon: '🎨' },
  { id: 'outdoor', name: 'Outdoor', icon: '🌲' },
  { id: 'social', name: 'Social', icon: '👥' },
  { id: 'learning', name: 'Learning', icon: '📚' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎪' },
  { id: 'wellness', name: 'Wellness', icon: '🧘' },
];

const timeSlots = [
  { id: 'morning', name: 'Morning (6AM - 12PM)', icon: '🌅' },
  { id: 'afternoon', name: 'Afternoon (12PM - 6PM)', icon: '☀️' },
  { id: 'evening', name: 'Evening (6PM - 10PM)', icon: '🌇' },
  { id: 'night', name: 'Night (10PM - 6AM)', icon: '🌙' },
];

export default function FilterPage() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<FilterOptions>({
    radius: 10,
    priceRange: [0, 100],
    categories: [],
    timeOfDay: [],
  });

  const [from, setFrom] = useState<string>('');

  useEffect(() => {
    setFrom(searchParams.get('from') || '');
  }, [searchParams]);

  const toggleCategory = (categoryId: string) => {
    setFilters(prev => ({
      ...prev,
      categories: prev.categories.includes(categoryId)
        ? prev.categories.filter(id => id !== categoryId)
        : [...prev.categories, categoryId],
    }));
  };

  const toggleTimeSlot = (timeId: string) => {
    setFilters(prev => ({
      ...prev,
      timeOfDay: prev.timeOfDay.includes(timeId)
        ? prev.timeOfDay.filter(id => id !== timeId)
        : [...prev.timeOfDay, timeId],
    }));
  };

  const resetFilters = () => {
    setFilters({
      radius: 10,
      priceRange: [0, 100],
      categories: [],
      timeOfDay: [],
    });
  };

  const activeFiltersCount = 
    filters.categories.length + 
    filters.timeOfDay.length + 
    (filters.radius !== 10 ? 1 : 0) +
    (filters.priceRange[0] !== 0 || filters.priceRange[1] !== 100 ? 1 : 0);

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
              {filters.radius !== 10 && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  📍 {filters.radius} miles
                </span>
              )}
              {(filters.priceRange[0] !== 0 || filters.priceRange[1] !== 100) && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  💰 ${filters.priceRange[0]} - ${filters.priceRange[1]}
                </span>
              )}
              {filters.categories.map((categoryId) => {
                const category = categories.find(c => c.id === categoryId);
                return (
                  <span key={categoryId} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                    {category?.icon} {category?.name}
                  </span>
                );
              })}
              {filters.timeOfDay.map((timeId) => {
                const timeSlot = timeSlots.find(t => t.id === timeId);
                return (
                  <span key={timeId} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
                    {timeSlot?.icon} {timeSlot?.name}
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
                  {[5, 10, 15, 25, 50].map((radius) => (
                    <button
                      key={radius}
                      onClick={() => setFilters(prev => ({ ...prev, radius }))}
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
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <label className="block text-sm text-gray-600">Min ($)</label>
                  <input
                    type="number"
                    value={filters.priceRange[0]}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      priceRange: [parseInt(e.target.value) || 0, prev.priceRange[1]]
                    }))}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-gray-600">Max ($)</label>
                  <input
                    type="number"
                    value={filters.priceRange[1]}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      priceRange: [prev.priceRange[0], parseInt(e.target.value) || 100]
                    }))}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Categories */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Categories</h3>
            <div className="grid grid-cols-2 gap-3">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => toggleCategory(category.id)}
                  className={`p-3 rounded-lg border text-center transition-colors ${
                    filters.categories.includes(category.id)
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <div className="text-2xl mb-1">{category.icon}</div>
                  <div className="text-sm font-medium">{category.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Time of Day */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Time of Day</h3>
            <div className="space-y-2">
              {timeSlots.map((slot) => (
                <button
                  key={slot.id}
                  onClick={() => toggleTimeSlot(slot.id)}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    filters.timeOfDay.includes(slot.id)
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <div className="flex items-center">
                    <span className="text-xl mr-3">{slot.icon}</span>
                    <span className="font-medium">{slot.name}</span>
                  </div>
                </button>
              ))}
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
