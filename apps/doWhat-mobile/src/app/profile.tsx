// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Link } = require('expo-router');
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView } from 'react-native';
// Type-only shim for expo-linear-gradient to avoid missing types error
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LinearGradient } = require('expo-linear-gradient');
import { theme } from '@dowhat/shared/src/theme';

import { registerForPushNotifications, sendLocalTestNotification } from '../lib/notifications';
import { supabase } from '../lib/supabase';

export default function Profile() {
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      setEmail(auth?.user?.email ?? null);
      if (!uid) return;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, expo_push_token')
        .eq('id', uid)
        .maybeSingle();
      setFullName((data?.full_name as string) || '');
      setAvatarUrl((data?.avatar_url as string) || '');
      setPushToken((data?.expo_push_token as string) || null);
    })();
  }, []);

  async function save() {
    setErr(null);
    setMsg(null);
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error('Please sign in first.');
      const upsert = {
        id: uid,
        full_name: fullName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('profiles').upsert(upsert, { onConflict: 'id' });
      if (error) throw error;
      setMsg('Saved');
    } catch (e: any) {
      setErr(e.message ?? 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.bg }} contentContainerStyle={{ paddingBottom: 24 }}>
      {/* Header */}
      <LinearGradient colors={[theme.colors.brandTeal, theme.colors.brandTealDark]} style={{ paddingTop: 16, paddingBottom: 24, paddingHorizontal: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Link href="/" asChild>
          <Pressable><Text style={{ color: 'white' }}>&larr; Home</Text></Pressable>
        </Link>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 12 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff', overflow: 'hidden' }}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 32 }}>🙂</Text></View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: 'white', fontSize: 20, fontWeight: '800' }}>{fullName || 'Your name'}</Text>
            {!!email && <Text style={{ color: 'white', opacity: 0.9 }}>{email}</Text>}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <View style={{ backgroundColor: theme.colors.brandYellow, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontWeight: '700', color: theme.colors.brandInk }}>Reliability 4.6</Text>
              </View>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: 'white' }}>Adventurous</Text>
              </View>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Edit Card */}
      <View style={{ marginTop: 16, marginHorizontal: 16, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 16, ...theme.shadow.card }}>
        {err && <Text style={{ marginBottom: 8, color: '#b91c1c' }}>{err}</Text>}
        {msg && <Text style={{ marginBottom: 8, color: '#065f46' }}>{msg}</Text>}
        <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8, color: theme.colors.brandInk }}>Edit profile</Text>
        <Text style={{ marginBottom: 6, color: theme.colors.ink60 }}>Full Name</Text>
        <TextInput value={fullName} onChangeText={setFullName} style={{ borderWidth: 1, borderRadius: 10, padding: 10, borderColor: '#e5e7eb' }} />
        <Text style={{ marginTop: 10, marginBottom: 6, color: theme.colors.ink60 }}>Avatar URL</Text>
        <TextInput value={avatarUrl} onChangeText={setAvatarUrl} style={{ borderWidth: 1, borderRadius: 10, padding: 10, borderColor: '#e5e7eb' }} />
        <Pressable onPress={save} disabled={loading} style={{ marginTop: 12, padding: 12, backgroundColor: theme.colors.brandTeal, borderRadius: 10, opacity: loading ? 0.6 : 1 }}>
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>{loading ? 'Saving…' : 'Save changes'}</Text>
        </Pressable>
      </View>

      {/* Past activities */}
      <View style={{ marginTop: 16, marginHorizontal: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.brandInk, marginBottom: 10 }}>Past activities</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {['Rock climbing', 'Tennis', 'Swimming', 'Running', 'Hiking', 'Yoga'].map((name, i) => (
            <View key={i} style={{ alignItems: 'center', gap: 6 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.brandYellow, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 28 }}>🎯</Text>
              </View>
              <Text style={{ color: theme.colors.ink60 }}>{name}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Notifications */}
      <View style={{ marginTop: 16, marginHorizontal: 16, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 16, ...theme.shadow.card }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.brandInk }}>Notifications</Text>
        <Text style={{ marginTop: 6, color: theme.colors.ink60 }}>Enable push notifications to get alerts for new nearby events.</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <Pressable onPress={async ()=>{ const t = await registerForPushNotifications(); if (t) { setPushToken(t); setMsg('Notifications enabled'); } else { setErr('Permission not granted'); } }} style={{ borderWidth: 1, borderRadius: 10, padding: 10, borderColor: theme.colors.brandTeal }}>
            <Text style={{ color: theme.colors.brandTeal }}>{pushToken ? 'Re-register token' : 'Enable push'}</Text>
          </Pressable>
          <Pressable onPress={sendLocalTestNotification} style={{ borderWidth: 1, borderRadius: 10, padding: 10, borderColor: theme.colors.brandTeal }}>
            <Text style={{ color: theme.colors.brandTeal }}>Send test</Text>
          </Pressable>
        </View>
        {!!pushToken && (
          <Text style={{ marginTop: 6, color: theme.colors.ink60 }} numberOfLines={1}>Token: {pushToken}</Text>
        )}
      </View>
    </ScrollView>
  );
}
