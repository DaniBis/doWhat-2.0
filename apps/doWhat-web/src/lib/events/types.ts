export type EventSourceType = 'ics' | 'rss' | 'jsonld';

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface EventSourceRow {
  id: string;
  url: string;
  type: EventSourceType;
  venue_hint: string | null;
  city: string | null;
  enabled: boolean;
  last_fetched_at: string | null;
  last_status: string | null;
  failure_count: number;
  fetch_interval_minutes: number | null;
  etag: string | null;
  last_modified: string | null;
  created_at: string;
  updated_at: string;
}

export type RawEventStatus = 'scheduled' | 'canceled';

export interface NormalizedEvent {
  sourceId: string | null;
  sourceType: EventSourceType;
  sourceUrl: string;
  sourceUid?: string | null;
  title: string;
  normalizedTitle: string;
  description?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  status: RawEventStatus;
  startAt: Date;
  endAt?: Date | null;
  timezone?: string | null;
  venueName?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  tags?: string[];
  metadata?: Record<string, Json>;
}

export interface VenueMatchResult {
  placeId: string | null;
  venueName: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  geohash7: string | null;
}

export interface EventUpsertRecord {
  id?: string;
  source_id: string | null;
  source_uid: string | null;
  dedupe_key: string;
  normalized_title: string;
  title: string;
  description: string | null;
  tags: string[];
  start_at: string;
  end_at: string | null;
  start_bucket: string;
  timezone: string | null;
  place_id: string | null;
  venue_name: string | null;
  lat: number | null;
  lng: number | null;
  geohash7: string | null;
  address: string | null;
  url: string | null;
  image_url: string | null;
  status: RawEventStatus;
  event_state: RawEventStatus;
  metadata: Record<string, Json>;
}

export interface IngestStats {
  sourceId: string;
  fetched: number;
  normalized: number;
  persisted: number;
  skipped: number;
  errors: number;
  lastStatus: string;
}

export interface IngestOptions {
  limitSources?: number;
  sourceIds?: string[];
}
