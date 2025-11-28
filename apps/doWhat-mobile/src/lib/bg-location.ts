import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { supabase } from './supabase';

export const BG_LOCATION_TASK = 'BG_LOCATION_TASK';
const STORAGE_KEY = '@bg_last_location';
const BG_LOCATION_WRITES_PROFILE =
  process.env.EXPO_PUBLIC_ENABLE_BG_LOCATION_PROFILE_SYNC === 'true' ||
  process.env.NEXT_PUBLIC_ENABLE_BG_LOCATION_PROFILE_SYNC === 'true';

type BackgroundLocationPayload = {
  lat: number;
  lng: number;
  ts: number;
};

// Define the background task at module load time (guard for Fast Refresh).
if (!TaskManager.isTaskDefined?.(BG_LOCATION_TASK)) {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] | undefined }>(BG_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      if (__DEV__) console.warn('[bg-location] task error', error.message);
      return;
    }
    const locations = data?.locations?.filter((loc): loc is Location.LocationObject => Boolean(loc?.coords)) ?? [];
    const [loc] = locations;
    if (!loc) return;
    const payload: BackgroundLocationPayload = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      ts: Date.now(),
    };
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      if (__DEV__) console.log('[bg-location] stored', payload);
      if (BG_LOCATION_WRITES_PROFILE) {
        // Opt-in: push to Supabase profile if signed in and schema supports it
        try {
          const { data: auth } = await supabase.auth.getUser();
          const uid = auth?.user?.id;
          if (uid) {
            await supabase
              .from('profiles')
              .update({
                last_lat: payload.lat,
                last_lng: payload.lng,
                last_location_at: new Date(payload.ts).toISOString(),
                updated_at: new Date(payload.ts).toISOString(),
              })
              .eq('id', uid);
          }
        } catch (pushError) {
          if (__DEV__) console.log('[bg-location] push to supabase skipped', pushError);
        }
      }
    } catch (storageError) {
      if (__DEV__) console.warn('[bg-location] failed to persist location', storageError);
    }
  });
}

export async function ensureBackgroundLocation(): Promise<boolean> {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);
    if (started) return true;

    // Ask foreground permissions first
    let fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      fg = await Location.requestForegroundPermissionsAsync();
    }
    if (fg.status !== 'granted') return false;

    // Ask for background permission for true background updates
    let bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      bg = await Location.requestBackgroundPermissionsAsync();
    }
    if (bg.status !== 'granted') {
      if (__DEV__) console.log('[bg-location] background permission not granted');
      return false;
    }

    await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      // Update either when moving ~100m or every N minutes
      distanceInterval: 100,
      timeInterval: __DEV__ ? 60 * 1000 : 5 * 60 * 1000,
      // iOS
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: true,
      activityType: Location.ActivityType.Fitness,
      // Android foreground service (required on recent Android versions)
      foregroundService: {
        notificationTitle: 'doWhat is using your location',
        notificationBody: 'To find nearby activities around you.',
        notificationColor: '#F59E0B',
      },
    });
    if (__DEV__) console.log('[bg-location] started');
    return true;
  } catch (error) {
    if (error instanceof Error && error.message?.includes('Foreground service permissions were not found')) {
      if (__DEV__) {
        console.warn(
          '[bg-location] foreground service permission missing. Rebuild the native app after adding android.permission.FOREGROUND_SERVICE_LOCATION.',
        );
      }
    } else if (__DEV__) {
      console.warn('[bg-location] failed to start', error instanceof Error ? error.message : error);
    }
    return false;
  }
}

export async function stopBackgroundLocation() {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);
    if (started) await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
  } catch {}
}

export async function getLastKnownBackgroundLocation(): Promise<BackgroundLocationPayload | null> {
  try {
    const s = await AsyncStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const parsed = JSON.parse(s) as BackgroundLocationPayload;
    if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number' || typeof parsed.ts !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
