import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';

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
    <View style={{ padding: 16 }}>
      <Link href="/" asChild>
        <Pressable><Text style={{ color: '#0d9488' }}>&larr; Back</Text></Pressable>
      </Link>
      <Text style={{ fontSize: 18, fontWeight: '700', marginTop: 8 }}>My Profile</Text>
      {email ? (
        <Text style={{ marginTop: 6, color: '#4b5563' }}>{email}</Text>
      ) : (
        <Text style={{ marginTop: 6, color: '#b91c1c' }}>Not signed in</Text>
      )}

      {err && <Text style={{ marginTop: 8, color: '#b91c1c' }}>{err}</Text>}
      {msg && <Text style={{ marginTop: 8, color: '#065f46' }}>{msg}</Text>}

      <Text style={{ marginTop: 12 }}>Full Name</Text>
      <TextInput value={fullName} onChangeText={setFullName} style={{ borderWidth: 1, borderRadius: 8, padding: 8 }} />
      <Text style={{ marginTop: 12 }}>Avatar URL</Text>
      <TextInput value={avatarUrl} onChangeText={setAvatarUrl} style={{ borderWidth: 1, borderRadius: 8, padding: 8 }} />
      <Pressable onPress={save} disabled={loading} style={{ marginTop: 12, padding: 10, backgroundColor: '#16a34a', borderRadius: 8, opacity: loading ? 0.6 : 1 }}>
        <Text style={{ color: 'white', textAlign: 'center' }}>{loading ? 'Saving…' : 'Save'}</Text>
      </Pressable>

      <View style={{ borderTopWidth: 1, marginTop: 16, paddingTop: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: '700' }}>Notifications</Text>
        <Text style={{ marginTop: 6, color: '#6b7280' }}>Enable push notifications to get alerts for new nearby events.</Text>
        <Pressable onPress={async ()=>{ const t = await registerForPushNotifications(); if (t) { setPushToken(t); setMsg('Notifications enabled'); } else { setErr('Permission not granted'); } }} style={{ marginTop: 8, borderWidth: 1, borderRadius: 8, padding: 10 }}>
          <Text>{pushToken ? 'Re-register push token' : 'Enable notifications'}</Text>
        </Pressable>
        <Pressable onPress={sendLocalTestNotification} style={{ marginTop: 8, borderWidth: 1, borderRadius: 8, padding: 10 }}>
          <Text>Send test notification</Text>
        </Pressable>
        {!!pushToken && (
          <Text style={{ marginTop: 6, color: '#4b5563' }} numberOfLines={1}>Token: {pushToken}</Text>
        )}
      </View>
    </View>
  );
}
