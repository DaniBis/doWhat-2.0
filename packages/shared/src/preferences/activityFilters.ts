export type ActivityFilterPreferences = {
  radius: number;
  priceRange: [number, number];
  categories: string[];
  timeOfDay: string[];
};

export const DEFAULT_ACTIVITY_FILTER_PREFERENCES: ActivityFilterPreferences = {
  radius: 10,
  priceRange: [0, 100],
  categories: [],
  timeOfDay: [],
};

const sortUnique = (values: string[]): string[] => {
  if (!values.length) return [];
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
};

export const normaliseActivityFilterPreferences = (
  prefs: ActivityFilterPreferences | null | undefined,
): ActivityFilterPreferences => {
  const source = prefs ?? DEFAULT_ACTIVITY_FILTER_PREFERENCES;
  const radius = Number.isFinite(source.radius) ? Math.max(1, Math.round(source.radius)) : DEFAULT_ACTIVITY_FILTER_PREFERENCES.radius;
  const lower = Number.isFinite(source.priceRange?.[0]) ? Math.max(0, Math.round(source.priceRange[0])) : DEFAULT_ACTIVITY_FILTER_PREFERENCES.priceRange[0];
  const upper = Number.isFinite(source.priceRange?.[1]) ? Math.max(lower, Math.round(source.priceRange[1])) : DEFAULT_ACTIVITY_FILTER_PREFERENCES.priceRange[1];
  return {
    radius,
    priceRange: [lower, upper],
    categories: sortUnique(source.categories ?? []),
    timeOfDay: sortUnique(source.timeOfDay ?? []),
  };
};

export const countActiveActivityFilters = (prefs: ActivityFilterPreferences): number => {
  let count = 0;
  if (prefs.categories.length) count += 1;
  if (prefs.timeOfDay.length) count += 1;
  if (prefs.radius !== DEFAULT_ACTIVITY_FILTER_PREFERENCES.radius) count += 1;
  if (
    prefs.priceRange[0] !== DEFAULT_ACTIVITY_FILTER_PREFERENCES.priceRange[0] ||
    prefs.priceRange[1] !== DEFAULT_ACTIVITY_FILTER_PREFERENCES.priceRange[1]
  ) {
    count += 1;
  }
  return count;
};

export const activityFiltersEqual = (
  a: ActivityFilterPreferences,
  b: ActivityFilterPreferences,
): boolean => {
  return (
    a.radius === b.radius &&
    a.priceRange[0] === b.priceRange[0] &&
    a.priceRange[1] === b.priceRange[1] &&
    a.categories.length === b.categories.length &&
    a.categories.every((value, idx) => value === b.categories[idx]) &&
    a.timeOfDay.length === b.timeOfDay.length &&
    a.timeOfDay.every((value, idx) => value === b.timeOfDay[idx])
  );
};
