import { DeviceEventEmitter, type EmitterSubscription } from 'react-native';

export const PROFILE_LOCATION_UPDATED_EVENT = 'profile:locationUpdated' as const;
export const MAP_PLACES_UPDATED_EVENT = 'discoverMap:placesUpdated' as const;

export type ProfileLocationUpdatePayload = {
  lat: number;
  lng: number;
  label?: string | null;
};

export const emitProfileLocationUpdated = (payload: ProfileLocationUpdatePayload) => {
  DeviceEventEmitter.emit(PROFILE_LOCATION_UPDATED_EVENT, payload);
};

export const subscribeProfileLocationUpdated = (
  listener: (payload: ProfileLocationUpdatePayload) => void,
): EmitterSubscription => DeviceEventEmitter.addListener(PROFILE_LOCATION_UPDATED_EVENT, listener);

export type MapPlaceBroadcast = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  categories: string[];
  address?: string | null;
  locality?: string | null;
  highlightedCategory?: string | null;
};

let latestMapPlaces: MapPlaceBroadcast[] = [];

export const emitMapPlacesUpdated = (places: MapPlaceBroadcast[]) => {
  latestMapPlaces = places;
  DeviceEventEmitter.emit(MAP_PLACES_UPDATED_EVENT, places);
};

export const subscribeMapPlacesUpdated = (
  listener: (places: MapPlaceBroadcast[]) => void,
): EmitterSubscription => DeviceEventEmitter.addListener(MAP_PLACES_UPDATED_EVENT, listener);

export const getLatestMapPlaces = (): MapPlaceBroadcast[] => latestMapPlaces;
