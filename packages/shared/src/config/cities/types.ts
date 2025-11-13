export interface CityCategoryConfig {
  key: string;
  label: string;
  /** Normalised categories used when querying the backend */
  queryCategories: string[];
  /** Optional lower-cased tag filters applied client-side */
  tagFilters?: string[];
}

export interface CityConfig {
  slug: string;
  name: string;
  label: string;
  center: { lat: number; lng: number };
  defaultZoom: number;
  defaultRegion: { latitudeDelta: number; longitudeDelta: number };
  bbox: {
    sw: { lat: number; lng: number };
    ne: { lat: number; lng: number };
  };
  enabledCategories: CityCategoryConfig[];
}
