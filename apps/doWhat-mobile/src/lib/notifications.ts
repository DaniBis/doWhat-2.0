import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

const getProjectId = (): string | undefined => {
  const expoConfigProjectId = (Constants as { expoConfig?: { extra?: { eas?: { projectId?: string } } } }).expoConfig?.extra?.eas?.projectId;
  if (expoConfigProjectId) return expoConfigProjectId;
  const easConfigProjectId = (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return easConfigProjectId;
};

export async function registerForPushNotifications() {
  let token: string | null = null;
  try {
    if (!Device.isDevice) return null;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    // EAS projectId helps ensure the token resolves correctly
    const projectId = getProjectId();
    const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    token = res.data;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default', importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    // Save to profile for future server pushes
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (uid && token) {
        await supabase.from('profiles').update({ expo_push_token: token, updated_at: new Date().toISOString() }).eq('id', uid);
      }
    } catch (error) {
      if (__DEV__) console.warn('[notifications] skipped saving token', error);
    }
  } catch (error) {
    if (__DEV__) console.warn('[notifications] registration failed', error);
  }
  return token;
}

export async function sendLocalTestNotification() {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'doWhat', body: 'Notifications are working 🎉' },
      trigger: null,
    });
    return true;
  } catch (error) {
    if (__DEV__) console.warn('[notifications] local test failed', error);
    return false;
  }
}
