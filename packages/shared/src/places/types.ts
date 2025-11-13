import type { MapCoordinates } from '../map/types';

export interface PlacesBounds {
  sw: MapCoordinates;
  ne: MapCoordinates;
}

export interface PlacesViewportQuery {
  bounds: PlacesBounds;
  categories?: string[];
  limit?: number;
  forceRefresh?: boolean;
  city?: string;
}

export interface PlaceAttribution {
  text: string;
  url?: string;
  license?: string;
}

export interface PlaceSummary {
  id: string;
  slug: string | null;
  name: string;
  lat: number;
  lng: number;
  categories: string[];
  tags: string[];
  address?: string | null;
  locality?: string | null;
  region?: string | null;
  country?: string | null;
  postcode?: string | null;
  phone?: string | null;
  website?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  priceLevel?: number | null;
  popularityScore?: number | null;
  aggregatedFrom: string[];
  primarySource?: string | null;
  cacheExpiresAt?: string;
  cachedAt?: string;
  attributions: Array<{ provider: string; text: string; url?: string; license?: string }>;
  metadata?: Record<string, unknown> | null;
  transient?: boolean;
}

export interface PlacesResponse {
  cacheHit: boolean;
  places: PlaceSummary[];
  providerCounts: Record<string, number>;
  attribution: PlaceAttribution[];
  latencyMs: number;
}

export interface PlaceSourceSnapshot {
  id: string;
  provider: string;
  providerPlaceId: string;
  fetchedAt: string;
  confidence?: number | null;
  name: string;
  categories: string[];
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  url?: string | null;
  attribution?: Record<string, unknown> | null;
}

export interface PlaceDetail extends PlaceSummary {
  sources: PlaceSourceSnapshot[];
  lastSeenAt?: string | null;
}
