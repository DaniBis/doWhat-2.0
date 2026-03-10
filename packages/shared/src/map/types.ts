import type { DiscoveryFilterContract } from '../discovery';
import type { CapacityFilterKey, TimeWindowKey } from '../preferences/mapFilters';

export interface MapCoordinates {
  lat: number;
  lng: number;
}

/** @deprecated use DiscoveryFilterContract terminology for new code. */
export type MapFilters = DiscoveryFilterContract;

export interface MapActivitiesQuery {
  center: MapCoordinates;
  /** Search radius in metres. */
  radiusMeters: number;
  limit?: number;
  filters?: MapFilters;
}

export interface MapActivity {
  id: string;
  name: string;
  venue?: string | null;
  place_label?: string | null;
  place_id?: string | null;
  website?: string | null;
  lat: number;
  lng: number;
  distance_m?: number | null;
  price_cents?: number | null;
  rating?: number | null;
  rating_count?: number | null;
  starts_at?: string | null;
  activity_types?: string[] | null;
  tags?: string[] | null;
  traits?: string[] | null;
  taxonomy_categories?: string[] | null;
  price_levels?: number[] | null;
  capacity_key?: CapacityFilterKey | null;
  time_window?: TimeWindowKey | null;
  upcoming_session_count?: number | null;
  source?: string | null;
  popularity_score?: number | null;
  source_confidence?: number | null;
  refreshed_at?: string | null;
  dedupe_key?: string | null;
  quality_confidence?: number | null;
  place_match_confidence?: number | null;
  trust_score?: number | null;
  verification_state?: 'suggested' | 'verified' | 'needs_votes';
  rank_score?: number | null;
  rank_breakdown?: {
    relevance: number;
    proximity: number;
    temporal: number;
    socialProof: number;
    quality: number;
  } | null;
}

export interface MapActivitiesResponse {
  center: MapCoordinates;
  radiusMeters: number;
  count: number;
  activities: MapActivity[];
  source?: 'postgis' | 'client-filter' | string;
  filterSupport?: {
    activityTypes: boolean;
    tags: boolean;
    traits: boolean;
    taxonomyCategories: boolean;
    priceLevels: boolean;
    capacityKey: boolean;
    timeWindow: boolean;
  };
  facets?: {
    activityTypes: { value: string; count: number }[];
    tags: { value: string; count: number }[];
    traits: { value: string; count: number }[];
    taxonomyCategories: { value: string; count: number }[];
    priceLevels: { value: string; count: number }[];
    capacityKey: { value: string; count: number }[];
    timeWindow: { value: string; count: number }[];
  };
  sourceBreakdown?: Record<string, number>;
  providerCounts?: Record<string, number>;
  cache?: { key: string; hit: boolean };
  degraded?: boolean;
  fallbackError?: string;
  fallbackSource?: string;
  radiusExpansion?: {
    fromRadiusMeters: number;
    toRadiusMeters: number;
    note: string;
    previousCount: number;
    expandedCount: number;
  };
  debug?: {
    cacheHit: boolean;
    cacheKey: string;
    tilesTouched: string[];
    providerCounts: Record<string, number>;
    pagesFetched: number;
    nextPageTokensUsed: number;
    itemsBeforeDedupe: number;
    itemsAfterDedupe: number;
    itemsAfterGates: number;
    itemsAfterFilters: number;
    dropReasons: Record<string, number>;
    candidateCounts: {
      afterRpc: number;
      afterFallbackMerge: number;
      afterMetadataFilter: number;
      afterPlaceGate: number;
      afterConfidenceGate: number;
      afterDedupe: number;
      final: number;
    };
    dropped: {
      notPlaceBacked: number;
      lowConfidence: number;
      genericLabels: number;
      deduped: number;
    };
    ranking: {
      enabled: boolean;
      placeMinConfidence: number;
    };
  };
}

export type MapActivityFeatureProperties = {
  kind: 'activity';
  id: string;
  name: string;
  venue?: string | null;
  price_cents?: number | null;
  rating?: number | null;
  rating_count?: number | null;
  starts_at?: string | null;
  activity_types?: string[] | null;
  tags?: string[] | null;
  traits?: string[] | null;
  distance_m?: number | null;
};

export interface MapActivityFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: MapActivityFeatureProperties;
}

export type EventFeatureProperties = {
  kind: 'event';
  id: string;
  title: string;
  start_at: string;
  end_at?: string | null;
  venue_name?: string | null;
  url?: string | null;
  status: string;
  tags?: string[] | null;
  place_id?: string | null;
};

export type MapFeature = MapActivityFeature | {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: EventFeatureProperties;
};

export interface MapFeatureCollection {
  type: 'FeatureCollection';
  features: MapFeature[];
}
