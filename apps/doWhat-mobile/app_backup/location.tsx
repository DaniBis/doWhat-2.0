import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';

import { ensureBackgroundLocation, stopBackgroundLocation, getLastKnownBackgroundLocation, BG_LOCATION_TASK } from '../lib/bg-location';

type PermState = 'granted' | 'denied' | 'undetermined';

export default function LocationSettings() {
  const [fg, setFg] = useState<PermState>('undetermined');
  const [bg, setBg] = useState<PermState>('undetermined');
  const [started, setStarted] = useState<boolean>(false);
  const [last, setLast] = useState<{ lat: number; lng: number; ts: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const f = await Location.getForegroundPermissionsAsync();
      setFg(f.status as PermState);
      const b = await Location.getBackgroundPermissionsAsync();
      setBg(b.status as PermState);
    } catch {}
    try {
      const s = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);
      setStarted(Boolean(s));
    } catch {}
    setLast(await getLastKnownBackgroundLocation());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function requestAlways() {
    setBusy(true);
    try {
      // Foreground first, then background
      let f = await Location.getForegroundPermissionsAsync();
      if (f.status !== 'granted') f = await Location.requestForegroundPermissionsAsync();
      if (f.status !== 'granted') return;
      const bg = await Location.requestBackgroundPermissionsAsync();
      // iOS often requires changing this in Settings; open automatically if denied
      if (Platform.OS === 'ios' && bg.status !== 'granted') {
        await Linking.openSettings?.();
      }
    } finally { setBusy(false); }
    refresh();
  }

  async function startBg() {
    setBusy(true);
    try {
      await ensureBackgroundLocation();
    } finally { setBusy(false); }
    refresh();
  }
  async function stopBg() {
    setBusy(true);
    try { await stopBackgroundLocation(); } finally { setBusy(false); }
    refresh();
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '700' }}>Location Settings</Text>
      <Text style={{ marginTop: 8, color: '#374151' }}>
        Enable background location so doWhat can suggest activities near you, even when the app is closed.
      </Text>

      <View style={{ marginTop: 12, borderWidth: 1, borderRadius: 12, padding: 12 }}>
        <Text style={{ fontWeight: '600' }}>Permissions</Text>
        <Text style={{ marginTop: 6 }}>Foreground: {fg}</Text>
        <Text>Background: {bg}</Text>
        <Text style={{ marginTop: 6 }}>Task running: {started ? 'yes' : 'no'}</Text>
        <Text style={{ marginTop: 6 }}>
          Last fix: {last ? `${last.lat.toFixed(5)}, ${last.lng.toFixed(5)} — ${new Date(last.ts).toLocaleString()}` : 'none yet'}
        </Text>
      </View>

      <View style={{ marginTop: 12, gap: 8 }}>
        <Pressable disabled={busy} onPress={requestAlways} style={{ opacity: busy ? 0.6 : 1, borderWidth: 1, borderRadius: 8, padding: 10 }}>
          <Text>Request “Always” permission</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={startBg} style={{ opacity: busy ? 0.6 : 1, borderWidth: 1, borderRadius: 8, padding: 10 }}>
          <Text>Start background updates</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={stopBg} style={{ opacity: busy ? 0.6 : 1, borderWidth: 1, borderRadius: 8, padding: 10 }}>
          <Text>Stop background updates</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openSettings?.()} style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}>
          <Text>Open system settings</Text>
        </Pressable>
        <Pressable onPress={refresh} style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}>
          <Text>Refresh status</Text>
        </Pressable>
        {Platform.OS === 'ios' && (
          <Text style={{ marginTop: 8, color: '#6b7280' }}>
            Tip: On iOS, “Always” is usually granted in Settings → doWhat → Location → Always. After enabling, return here and tap “Refresh status”.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
