export type PeopleFilterPreferences = {
  personalityTraits: string[];
  skillLevels: string[];
  ageRanges: string[];
  groupSizePreference: string[];
  behaviors: string[];
  badges: string[];
  interests: string[];
};

export const DEFAULT_PEOPLE_FILTER_PREFERENCES: PeopleFilterPreferences = {
  personalityTraits: [],
  skillLevels: [],
  ageRanges: [],
  groupSizePreference: [],
  behaviors: [],
  badges: [],
  interests: [],
};

const sortUnique = (values: string[]): string[] => {
  if (!values.length) return [];
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
};

export const normalisePeopleFilterPreferences = (
  prefs: PeopleFilterPreferences | null | undefined,
): PeopleFilterPreferences => {
  const source = prefs ?? DEFAULT_PEOPLE_FILTER_PREFERENCES;
  return {
    personalityTraits: sortUnique(source.personalityTraits ?? []),
    skillLevels: sortUnique(source.skillLevels ?? []),
    ageRanges: sortUnique(source.ageRanges ?? []),
    groupSizePreference: sortUnique(source.groupSizePreference ?? []),
    behaviors: sortUnique(source.behaviors ?? []),
    badges: sortUnique(source.badges ?? []),
    interests: sortUnique(source.interests ?? []),
  };
};

export const peopleFiltersEqual = (
  a: PeopleFilterPreferences,
  b: PeopleFilterPreferences,
): boolean => {
  const fields: Array<keyof PeopleFilterPreferences> = [
    'personalityTraits',
    'skillLevels',
    'ageRanges',
    'groupSizePreference',
    'behaviors',
    'badges',
    'interests',
  ];
  return fields.every((field) => {
    const left = a[field];
    const right = b[field];
    return left.length === right.length && left.every((value, idx) => value === right[idx]);
  });
};

export const flattenPeopleFiltersToTraits = (prefs: PeopleFilterPreferences): string[] => {
  return Array.from(
    new Set([
      ...prefs.personalityTraits,
      ...prefs.behaviors,
      ...prefs.badges,
      ...prefs.interests,
    ]),
  );
};

export const countActivePeopleFilters = (prefs: PeopleFilterPreferences): number => {
  let count = 0;
  const considered: Array<keyof PeopleFilterPreferences> = [
    'personalityTraits',
    'skillLevels',
    'ageRanges',
    'groupSizePreference',
    'behaviors',
    'badges',
    'interests',
  ];
  considered.forEach((field) => {
    if ((prefs[field] ?? []).length) count += 1;
  });
  return count;
};
