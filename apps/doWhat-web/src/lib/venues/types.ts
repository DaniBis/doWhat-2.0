import type { ActivityName } from '@/lib/venues/constants';

export interface ExternalVenueRecord {
  provider: 'foursquare' | 'google';
  providerId: string;
  name: string;
  description?: string | null;
  categories: string[];
  keywords: string[];
  rating?: number | null;
  priceLevel?: number | null;
  lat?: number | null;
  lng?: number | null;
  photos?: string[];
  reviews?: string[];
  address?: string | null;
  locality?: string | null;
  region?: string | null;
  country?: string | null;
  postcode?: string | null;
  timezone?: string | null;
  hoursSummary?: string | null;
  openNow?: boolean | null;
  hours?: Record<string, unknown> | null;
}

export interface VenueClassificationResult {
  tags: ActivityName[];
  confidence: Record<ActivityName, number>;
  timestamp: string;
}

export interface RankedVenueActivity {
  venueId: string;
  venueName: string;
  lat: number | null;
  lng: number | null;
  displayAddress: string | null;
  primaryCategories: string[];
  rating: number | null;
  priceLevel: number | null;
  photoUrl: string | null;
  openNow: boolean | null;
  hoursSummary: string | null;
  activity: ActivityName;
  aiConfidence: number;
  userYesVotes: number;
  userNoVotes: number;
  categoryMatch: boolean;
  keywordMatch: boolean;
  score: number;
  verified: boolean;
  needsVerification: boolean;
}

export interface ActivityAvailabilitySummary {
  activity: ActivityName;
  verifiedCount: number;
  likelyCount: number;
  possibleCount: number;
  needsReviewCount: number;
  averageConfidence: number | null;
}
