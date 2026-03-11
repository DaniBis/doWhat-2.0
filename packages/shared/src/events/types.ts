import type { DiscoveryResultKind, DiscoveryTrustMode } from '../discovery';

export type EventState = 'scheduled' | 'canceled';
export type EventResultKind = 'events';
export type EventOriginKind = 'session' | 'event';
export type EventLocationKind = 'canonical_place' | 'legacy_venue' | 'custom_location' | 'flexible';
export type EventDiscoveryKind = 'session_mirror' | 'imported_event' | 'open_event';
export type ParticipationTruthLevel = 'first_party' | 'linked_first_party' | 'external_source' | 'unavailable';
export type AttendanceSourceKind = 'session_attendance' | 'external_source' | 'none';
export type HostKind = 'session_host' | 'external_organizer' | 'unknown';
export type OrganizerKind = 'dowhat_host' | 'external_source' | 'unknown';
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

export interface ParticipationTruthSummary {
  attendance_supported: boolean;
  attendance_source_kind: AttendanceSourceKind;
  first_party_attendance: boolean;
  rsvp_supported: boolean;
  verification_supported: boolean;
  participation_truth_level: ParticipationTruthLevel;
  host_kind: HostKind;
  organizer_kind: OrganizerKind;
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
  result_kind?: EventResultKind | null;
  origin_kind?: EventOriginKind | null;
  location_kind?: EventLocationKind | null;
  discovery_kind?: EventDiscoveryKind | null;
  discovery_dedupe_key?: string | null;
  is_place_backed?: boolean | null;
  participation?: ParticipationTruthSummary | null;
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
