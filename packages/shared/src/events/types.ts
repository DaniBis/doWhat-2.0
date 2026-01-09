export type EventState = 'scheduled' | 'canceled';
export type EventVerificationStatus =
  | 'verified'
  | 'rejected'
  | 'pending'
  | 'unverified'
  | 'scheduled'
  | 'canceled';

export interface EventPlaceSummary {
  id: string;
  name: string;
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
}

export interface EventsResponse {
  events: EventSummary[];
}

export interface EventsQuery {
  sw?: { lat: number; lng: number };
  ne?: { lat: number; lng: number };
  from?: string;
  to?: string;
  categories?: string[];
  limit?: number;
}
