export type MapFilterPreferences = {
  activityTypes: string[];
  traits: string[];
};

export const DEFAULT_MAP_FILTER_PREFERENCES: MapFilterPreferences = {
  activityTypes: [],
  traits: [],
};

const normaliseList = (values: string[] | null | undefined): string[] => {
  if (!values || !values.length) return [];
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
};

export const normaliseMapFilterPreferences = (
  prefs: MapFilterPreferences | null | undefined,
): MapFilterPreferences => {
  const source = prefs ?? DEFAULT_MAP_FILTER_PREFERENCES;
  return {
    activityTypes: normaliseList(source.activityTypes),
    traits: normaliseList(source.traits),
  };
};

export const mapPreferencesToQueryFilters = (
  prefs: MapFilterPreferences,
): {
  activityTypes?: string[];
  traits?: string[];
} | undefined => {
  const { activityTypes, traits } = normaliseMapFilterPreferences(prefs);
  const filters: { activityTypes?: string[]; traits?: string[] } = {};
  if (activityTypes.length) filters.activityTypes = activityTypes;
  if (traits.length) filters.traits = traits;
  return Object.keys(filters).length ? filters : undefined;
};
