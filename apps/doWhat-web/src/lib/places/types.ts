export type PlaceProvider = 'openstreetmap' | 'foursquare' | 'google_places';

export interface ViewportBounds {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
}

export interface PlacesQuery {
  bounds: ViewportBounds;
  categories?: string[];
  limit?: number;
  forceRefresh?: boolean;
  city?: string;
}

export interface ProviderAttribution {
  text: string;
  url?: string;
  license?: string;
}

export interface ProviderPlace {
  provider: PlaceProvider;
  providerId: string;
  name: string;
  lat: number;
  lng: number;
  categories: string[];
  tags?: string[];
  address?: string;
  description?: string | null;
  locality?: string;
  region?: string;
  country?: string;
  postcode?: string;
  phone?: string;
  website?: string;
  rating?: number;
  ratingCount?: number;
  priceLevel?: number;
  confidence?: number;
  attribution: ProviderAttribution;
  raw: Record<string, unknown>;
  canPersist?: boolean; // Google results remain transient when false
}

export interface ExistingPlaceRow {
  id: string;
  slug: string | null;
  name: string;
  description?: string | null;
  categories: string[] | null;
  tags: string[] | null;
  address?: string | null;
  city?: string | null;
  locality?: string | null;
  region?: string | null;
  country?: string | null;
  postcode?: string | null;
  lat: number;
  lng: number;
  phone?: string | null;
  website?: string | null;
  popularity_score?: number | null;
  rating?: number | null;
  rating_count?: number | null;
  price_level?: number | null;
  aggregated_from?: string[] | null;
  primary_source?: string | null;
  attribution?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  cached_at?: string | null;
  cache_expires_at?: string | null;
  last_seen_at?: string | null;
  geohash6?: string | null;
  source_confidence?: number | null;
  foursquare_id?: string | null;
}

export interface PlaceSourceRow {
  id: string;
  place_id: string;
  provider: PlaceProvider;
  provider_place_id: string;
  fetched_at: string;
  next_refresh_at?: string | null;
  confidence?: number | null;
  name: string;
  categories?: string[] | null;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  url?: string | null;
  attribution?: Record<string, unknown> | null;
  raw?: Record<string, unknown> | null;
}

export interface PlaceAttribution {
  provider: PlaceProvider;
  text: string;
  url?: string;
  license?: string;
}

export interface CanonicalPlace {
  id: string;
  slug: string | null;
  name: string;
  description?: string;
  lat: number;
  lng: number;
  categories: string[];
  tags: string[];
  address?: string;
  city?: string;
  locality?: string;
  region?: string;
  country?: string;
  postcode?: string;
  phone?: string;
  website?: string;
  fsqId?: string | null;
  rating?: number;
  ratingCount?: number;
  priceLevel?: number;
  popularityScore?: number;
  aggregatedFrom: PlaceProvider[];
  primarySource?: PlaceProvider;
  cacheExpiresAt?: string;
  cachedAt?: string;
  attributions: PlaceAttribution[];
  metadata?: Record<string, unknown>;
  transient?: boolean;
}

export interface PersistablePlaceInput {
  id?: string;
  slug?: string | null;
  name: string;
  description?: string | null;
  lat: number;
  lng: number;
  categories: string[];
  tags: string[];
  address?: string | null;
  city?: string | null;
  locality?: string | null;
  region?: string | null;
  country?: string | null;
  postcode?: string | null;
  phone?: string | null;
  website?: string | null;
  rating?: number | null;
  rating_count?: number | null;
  price_level?: number | null;
  popularity_score?: number | null;
  aggregated_from: PlaceProvider[];
  primary_source?: PlaceProvider;
  attribution: Record<string, unknown>;
  metadata: Record<string, unknown>;
  cached_at: string;
  cache_expires_at: string;
  last_seen_at: string;
  foursquare_id?: string | null;
}

export interface PersistablePlaceSourceInput {
  place_id: string;
  provider: PlaceProvider;
  provider_place_id: string;
  fetched_at: string;
  next_refresh_at?: string | null;
  confidence?: number | null;
  name: string;
  categories: string[];
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  url?: string | null;
  attribution: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface PlacesFetchResult {
  places: CanonicalPlace[];
  cacheHit: boolean;
  providerCounts: Record<PlaceProvider, number>;
}
