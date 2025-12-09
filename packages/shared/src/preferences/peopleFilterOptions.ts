export const PEOPLE_FILTER_SKILL_LEVELS = [
  "Beginner",
  "Intermediate",
  "Advanced",
  "Expert",
] as const;
export type PeopleFilterSkillLevel = (typeof PEOPLE_FILTER_SKILL_LEVELS)[number];

export const PEOPLE_FILTER_AGE_RANGES = [
  "18-25",
  "26-35",
  "36-45",
  "46-55",
  "55+",
] as const;
export type PeopleFilterAgeRange = (typeof PEOPLE_FILTER_AGE_RANGES)[number];

export const PEOPLE_FILTER_GROUP_SIZES = [
  "1-5 people",
  "6-15 people",
  "16-30 people",
  "30+ people",
] as const;
export type PeopleFilterGroupSize = (typeof PEOPLE_FILTER_GROUP_SIZES)[number];
