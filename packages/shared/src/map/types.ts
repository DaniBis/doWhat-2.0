export interface MapCoordinates {
  lat: number;
  lng: number;
}

export interface MapFilters {
  /** Activity categories or types (maps to `types` query param). */
  activityTypes?: string[];
  /** Free-form tags that further refine matching activities. */
  tags?: string[];
  /** People-related traits or personas to include. */
  traits?: string[];
}

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
}

export interface MapActivitiesResponse {
  center: MapCoordinates;
  radiusMeters: number;
  count: number;
  activities: MapActivity[];
  source?: 'postgis' | 'client-filter' | string;
}

export type MapActivityFeatureProperties = {
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

export interface MapFeatureCollection {
  type: 'FeatureCollection';
  features: MapActivityFeature[];
}
