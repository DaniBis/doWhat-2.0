export interface RecommendationTraitPreferenceRow {
  preferred_traits?: string[] | null;
}

export interface RecommendationActivityRef {
  id: string;
  name: string;
  description?: string | null;
  activity_types?: string[] | null;
  tags?: string[] | null;
  traits?: string[] | null;
  participant_preferences?: RecommendationTraitPreferenceRow | RecommendationTraitPreferenceRow[] | null;
}

export interface RecommendationVenueRef {
  id?: string | null;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface RecommendationSessionAttendee {
  status: string | null;
}

export interface RecommendationSession {
  id: string;
  activity_id?: string | null;
  host_user_id?: string | null;
  price_cents: number;
  starts_at: string;
  ends_at: string;
  venue_id?: string | null;
  visibility?: string | null;
  activities: RecommendationActivityRef | RecommendationActivityRef[] | null;
  venues: RecommendationVenueRef | RecommendationVenueRef[] | null;
  session_attendees?: RecommendationSessionAttendee[] | null;
}

export interface RecommendationBreakdown {
  components: {
    traits: number;
    categories: number;
    proximity: number;
    engagement: number;
  };
  matchedTraits: string[];
  matchedCategories: string[];
  distanceKm?: number | null;
  engagementMatches?: string[];
}

export interface RecommendationRecord {
  session: RecommendationSession;
  score: number;
  normalizedScore: number;
  breakdown: RecommendationBreakdown;
}

export interface RecommendationResponse {
  userId: string;
  generatedAt: string;
  limit: number;
  recommendations: RecommendationRecord[];
}

export interface RecommendationErrorPayload {
  error: string;
}
