export const ACTIVITY_NAMES = [
  'chess',
  'board games',
  'bouldering',
  'climbing',
  'yoga',
  'tennis',
  'dancing',
  'karaoke',
  'ping pong',
  'badminton',
  'pool',
  'billiards',
  'archery',
  'gaming',
  'running',
  'bowling',
] as const;

export type ActivityName = (typeof ACTIVITY_NAMES)[number];

export const CLASSIFICATION_MODEL = 'gpt-4o-mini';

export const CONFIDENCE_BUCKETS = {
  verifiedThreshold: 0.9,
  likely: 0.8,
  possible: 0.5,
};

export const FOURSQUARE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const GOOGLE_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
export const CLASSIFICATION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export const VENUE_SEARCH_DEFAULT_RADIUS = 5000; // meters
export const VENUE_SEARCH_MAX_LIMIT = 100;
