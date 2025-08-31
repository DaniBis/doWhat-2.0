import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function Profile() {
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      setEmail(auth?.user?.email ?? null);
      if (!uid) return;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', uid)
        .maybeSingle();
      setFullName((data?.full_name as string) || '');
      setAvatarUrl((data?.avatar_url as string) || '');
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
    </View>
  );
}
