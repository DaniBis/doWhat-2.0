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
