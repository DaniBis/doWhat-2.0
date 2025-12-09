import { DEFAULT_ACTIVITY_FILTER_PREFERENCES, type ActivityFilterPreferences } from "./activityFilters";

export const DEFAULT_ACTIVITY_RADIUS = DEFAULT_ACTIVITY_FILTER_PREFERENCES.radius;
export const DEFAULT_ACTIVITY_PRICE_RANGE: [number, number] = [
  DEFAULT_ACTIVITY_FILTER_PREFERENCES.priceRange[0],
  DEFAULT_ACTIVITY_FILTER_PREFERENCES.priceRange[1],
];

export const ACTIVITY_DISTANCE_OPTIONS = [5, 10, 15, 25, 50] as const;
export type ActivityDistanceOption = (typeof ACTIVITY_DISTANCE_OPTIONS)[number];

export type ActivityPriceFilterKey = "all" | "free" | "low" | "medium" | "high";

export type ActivityPriceFilterOption = {
  key: ActivityPriceFilterKey;
  label: string;
  range: [number, number];
  helper?: string;
};

export const ACTIVITY_PRICE_FILTER_OPTIONS: ActivityPriceFilterOption[] = [
  { key: "all", label: "All Prices", range: DEFAULT_ACTIVITY_PRICE_RANGE },
  { key: "free", label: "Free", range: [0, 0] },
  { key: "low", label: "$1 - $20", range: [1, 20] },
  { key: "medium", label: "$21 - $50", range: [21, 50] },
  { key: "high", label: "$50+", range: [50, 100] },
];

const priceOptionMap = new Map<ActivityPriceFilterKey, ActivityPriceFilterOption>(
  ACTIVITY_PRICE_FILTER_OPTIONS.map((option) => [option.key, option]),
);

export const resolvePriceRangeForKey = (key: ActivityPriceFilterKey): [number, number] =>
  priceOptionMap.get(key)?.range ?? DEFAULT_ACTIVITY_PRICE_RANGE;

export const resolvePriceKeyFromRange = (range: [number, number]): ActivityPriceFilterKey => {
  const match = ACTIVITY_PRICE_FILTER_OPTIONS.find(
    (option) => option.range[0] === range[0] && option.range[1] === range[1],
  );
  return match?.key ?? "all";
};

export type ActivityTimeFilterKey = "any" | "early" | "morning" | "afternoon" | "evening" | "night";

export type ActivityTimeFilterOption = {
  key: ActivityTimeFilterKey;
  label: string;
  value: string | null;
  icon?: string;
  aliases?: string[];
};

export const ACTIVITY_TIME_FILTER_OPTIONS: ActivityTimeFilterOption[] = [
  {
    key: "any",
    label: "Anytime",
    value: null,
    icon: "⚙️",
    aliases: ["any", "Anytime"],
  },
  {
    key: "early",
    label: "Early Morning (6-9 AM)",
    value: "Early Morning (6-9 AM)",
    icon: "🌤️",
    aliases: ["early"],
  },
  {
    key: "morning",
    label: "Morning (9-12 PM)",
    value: "Morning (9-12 PM)",
    icon: "🌅",
    aliases: ["morning"],
  },
  {
    key: "afternoon",
    label: "Afternoon (12-6 PM)",
    value: "Afternoon (12-6 PM)",
    icon: "☀️",
    aliases: ["afternoon"],
  },
  {
    key: "evening",
    label: "Evening (6-9 PM)",
    value: "Evening (6-9 PM)",
    icon: "🌇",
    aliases: ["evening"],
  },
  {
    key: "night",
    label: "Night (9 PM+)",
    value: "Night (9 PM+)",
    icon: "🌙",
    aliases: ["night"],
  },
];

const timeOptionMap = new Map<ActivityTimeFilterKey, ActivityTimeFilterOption>(
  ACTIVITY_TIME_FILTER_OPTIONS.map((option) => [option.key, option]),
);

const findTimeOptionByValue = (value: string) =>
  ACTIVITY_TIME_FILTER_OPTIONS.find((option) => {
    if (option.value === value) return true;
    return option.aliases?.some((alias) => alias === value);
  });

export const resolveTimeValuesFromKey = (key: ActivityTimeFilterKey): string[] => {
  const option = timeOptionMap.get(key);
  if (!option || !option.value) return [];
  return [option.value];
};

export const resolveTimeKeyFromValues = (values: readonly string[]): ActivityTimeFilterKey => {
  if (!values.length) {
    return "any";
  }
  for (const option of ACTIVITY_TIME_FILTER_OPTIONS) {
    if (option.value && values.includes(option.value)) {
      return option.key;
    }
    if (option.aliases && option.aliases.some((alias) => values.includes(alias))) {
      return option.key;
    }
  }
  return "any";
};

export const canonicaliseTimeOfDayValues = (values: readonly string[]): string[] => {
  if (!values.length) return [];
  const canonical = new Set<string>();
  values.forEach((entry) => {
    const trimmed = entry?.trim();
    if (!trimmed) return;
    const match = findTimeOptionByValue(trimmed);
    if (match?.value) {
      canonical.add(match.value);
      return;
    }
    canonical.add(trimmed);
  });
  return Array.from(canonical);
};

export const buildFilterSummary = (prefs: ActivityFilterPreferences) => ({
  hasRadiusOverride: prefs.radius !== DEFAULT_ACTIVITY_RADIUS,
  hasPriceOverride:
    prefs.priceRange[0] !== DEFAULT_ACTIVITY_PRICE_RANGE[0] ||
    prefs.priceRange[1] !== DEFAULT_ACTIVITY_PRICE_RANGE[1],
  selectedCategories: prefs.categories,
  timeSelections: prefs.timeOfDay,
});
