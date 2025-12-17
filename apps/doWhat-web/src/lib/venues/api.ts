import type { VenueRow } from '@/types/database';

export type SerializedVenue = {
  id: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  rawDescription: string | null;
  rawReviews: string[];
  aiTags: string[];
  aiConfidence: Record<string, number> | null;
  verifiedActivities: string[];
  lastAiUpdate: string | null;
  needsVerification: boolean;
};

export function serializeVenueRow(venue: VenueRow): SerializedVenue {
  return {
    id: venue.id,
    name: venue.name ?? null,
    lat: venue.lat ?? null,
    lng: venue.lng ?? null,
    rawDescription: venue.raw_description ?? null,
    rawReviews: Array.isArray(venue.raw_reviews) ? venue.raw_reviews : [],
    aiTags: Array.isArray(venue.ai_activity_tags) ? venue.ai_activity_tags : [],
    aiConfidence: toConfidenceMap(venue.ai_confidence_scores),
    verifiedActivities: Array.isArray(venue.verified_activities) ? venue.verified_activities : [],
    lastAiUpdate: venue.last_ai_update ?? null,
    needsVerification: Boolean(venue.needs_verification),
  };
}

export function toConfidenceMap(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object') return null;
  const result: Record<string, number> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
    const num = Number(raw);
    if (Number.isFinite(num)) {
      result[key] = Number(num.toFixed(3));
    }
  });
  return Object.keys(result).length ? result : null;
}
