import type { DiscoveryResultKind, DiscoveryTrustMode } from '../discovery';

export type EventState = 'scheduled' | 'canceled';
export type EventOriginKind = 'session' | 'event';
export type EventLocationKind = 'canonical_place' | 'legacy_venue' | 'custom_location' | 'flexible';
export type EventVerificationStatus =
  | 'verified'
  | 'rejected'
  | 'pending'
  | 'unverified'
  | 'scheduled'
  | 'canceled';

export interface EventPlaceSummary {
  id: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  locality: string | null;
  region?: string | null;
  country?: string | null;
  categories?: string[] | null;
}

export interface EventSummary {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  timezone: string | null;
  venue_name: string | null;
  place_label?: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  url: string | null;
  image_url: string | null;
  status: EventVerificationStatus;
  event_state?: EventState | null;
  reliability_score?: number | null;
  tags: string[] | null;
  place_id: string | null;
  source_id: string | null;
  source_uid: string | null;
  metadata?: Record<string, unknown> | null;
  place?: EventPlaceSummary | null;
  verification_confirmations?: number | null;
  verification_required?: number | null;
  origin_kind?: EventOriginKind | null;
  location_kind?: EventLocationKind | null;
  is_place_backed?: boolean | null;
}

export interface EventsResponse {
  events: EventSummary[];
}

export interface EventsQuery {
  sw?: { lat: number; lng: number };
  ne?: { lat: number; lng: number };
  from?: string;
  to?: string;
  limit?: number;
  resultKinds?: DiscoveryResultKind[];
  searchText?: string;
  activityTypes?: string[];
  tags?: string[];
  taxonomyCategories?: string[];
  trustMode?: DiscoveryTrustMode;
  categories?: string[];
  verifiedOnly?: boolean;
  minAccuracy?: number;
}
