export interface FoursquareCategory {
  id: number | string;
  name: string;
  icon?: { prefix: string; suffix: string };
}

export interface FoursquareLocation {
  address?: string;
  address_extended?: string;
  locality?: string;
  region?: string;
  postcode?: string;
  country?: string;
  formatted_address?: string;
}

export interface FoursquareGeoPoint {
  latitude: number;
  longitude: number;
}

export interface FoursquareGeocodes {
  main?: FoursquareGeoPoint;
  roof?: FoursquareGeoPoint;
  drop_off?: FoursquareGeoPoint;
  driveway?: FoursquareGeoPoint;
}

export interface FoursquareHourSegment {
  day?: number;
  open?: string;
  close?: string;
  start?: string;
  end?: string;
  rendered_time?: string;
}

export interface FoursquareHours {
  display?: string;
  is_open?: boolean;
  open_now?: boolean;
  regular?: FoursquareHourSegment[];
  seasonal?: FoursquareHourSegment[];
}

export interface FoursquarePlace {
  fsq_id: string;
  name: string;
  link?: string;
  description?: string;
  website?: string;
  tel?: string;
  distance?: number;
  categories?: FoursquareCategory[];
  geocodes?: FoursquareGeocodes;
  location?: FoursquareLocation;
  hours?: FoursquareHours;
  popularity?: number;
  rating?: number;
}

export interface FoursquareSearchResponse {
  results?: FoursquarePlace[];
  context?: Record<string, unknown>;
}
