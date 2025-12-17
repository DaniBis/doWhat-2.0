import type { PlaceSummary, SavePayload } from "@dowhat/shared";
import { buildPlaceSavePayload } from "@dowhat/shared";
import type { RankedVenueActivity } from "@/lib/venues/types";

export function buildVenueSavePayload(venue: RankedVenueActivity | null | undefined): SavePayload | null {
  if (!venue?.venueId) return null;
  const summary: PlaceSummary = {
    id: venue.venueId,
    slug: null,
    name: venue.venueName,
    lat: venue.lat ?? 0,
    lng: venue.lng ?? 0,
    categories: venue.primaryCategories ?? [],
    tags: [],
    address: venue.displayAddress ?? null,
    city: null,
    locality: null,
    region: null,
    country: null,
    postcode: null,
    phone: null,
    website: null,
    description: null,
    fsqId: null,
    rating: venue.rating,
    ratingCount: null,
    priceLevel: venue.priceLevel,
    popularityScore: null,
    aggregatedFrom: [],
    primarySource: null,
    cacheExpiresAt: undefined,
    cachedAt: undefined,
    attributions: [],
    metadata: null,
    transient: true,
  };
  const basePayload = buildPlaceSavePayload(summary, null);
  if (!basePayload) return null;
  return {
    ...basePayload,
    metadata: {
      ...(basePayload.metadata ?? {}),
      source: 'venue_verification',
      activity: venue.activity,
      aiConfidence: venue.aiConfidence,
      score: venue.score,
      verified: venue.verified,
      needsVerification: venue.needsVerification,
    },
  } satisfies SavePayload;
}
