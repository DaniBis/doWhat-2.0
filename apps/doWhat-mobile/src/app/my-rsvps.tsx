import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';

import { supabase } from '../lib/supabase';

type Row = { id: string; activity_id: string; status: 'going' | 'interested' | 'declined' };

export default function MyRsvps() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        setError('Please sign in to see your RSVPs.');
        setLoading(false);
        return;
      }
      const { data: rsvps, error } = await supabase
        .from('rsvps')
        .select('id,activity_id,status')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const ids = (rsvps ?? []).map((r) => r.activity_id);
      if (!ids.length) {
        setRows([]);
        setLoading(false);
        return;
      }
      // Fetch upcoming sessions for those activities and pick the next one per activity
      const { data: sessions, error: e2 } = await supabase
        .from('sessions')
        .select('id, activity_id, starts_at, ends_at, price_cents, activities(name), venues(name)')
        .in('activity_id', ids)
        .order('starts_at', { ascending: true });
      if (e2) setError(e2.message);
      const nextByActivity = new Map<string, any>();
      for (const s of (sessions ?? [])) {
        const key = s.activity_id as string;
        if (!nextByActivity.has(key)) nextByActivity.set(key, s);
      }
      const merged = (rsvps ?? [])
        .map((r: Row) => ({ rsvp: r, sess: nextByActivity.get(r.activity_id) }))
        .filter((x) => x.sess)
        .map((x) => ({ ...(x.sess as any), rsvp: x.rsvp }));
      setRows(merged);
      setLoading(false);
    })();
  }, []);

  async function updateStatus(activity_id: string, next: Row['status']) {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return;
    const { error } = await supabase
      .from('rsvps')
      .upsert({ activity_id, user_id: uid, status: next }, { onConflict: 'activity_id,user_id' });
    if (!error)
      setRows((prev) =>
        prev.map((a) => (a.activity_id === activity_id ? { ...a, rsvp: { ...a.rsvp, status: next } } : a))
      );
  }

  if (loading) return <Text style={{ padding: 16 }}>Loading…</Text>;
  if (error) return <Text style={{ padding: 16, color: 'red' }}>{error}</Text>;

  return (
    <FlatList
      contentContainerStyle={{ padding: 12, gap: 12 }}
      data={rows}
      keyExtractor={(a) => a.id}
      ListHeaderComponent={
        <Link href="/" asChild>
          <Pressable style={{ marginBottom: 8 }}><Text style={{ color: '#0d9488' }}>&larr; Back</Text></Pressable>
        </Link>
      }
      ListEmptyComponent={<Text style={{ padding: 12 }}>You have no RSVPs yet.</Text>}
      renderItem={({ item: a }) => (
        <View style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}>
          <Text style={{ fontWeight: '700' }}>{a.activities?.name ?? 'Activity'}</Text>
          <Text style={{ color: '#4b5563' }}>{a.venues?.name ?? 'Venue'}</Text>
          <Text style={{ marginTop: 6 }}>Status: <Text style={{ fontWeight: '700' }}>{a.rsvp.status}</Text></Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable onPress={() => updateStatus(a.activity_id, 'going')} style={{ borderWidth: 1, borderRadius: 8, padding: 8 }}><Text>Going</Text></Pressable>
            <Pressable onPress={() => updateStatus(a.activity_id, 'interested')} style={{ borderWidth: 1, borderRadius: 8, padding: 8 }}><Text>Interested</Text></Pressable>
            <Pressable onPress={() => updateStatus(a.activity_id, 'declined')} style={{ borderWidth: 1, borderRadius: 8, padding: 8 }}><Text>Declined</Text></Pressable>
            <Link href={`/sessions/${a.id}`} asChild>
              <Pressable style={{ marginLeft: 'auto' }}><Text style={{ color: '#0d9488' }}>Open</Text></Pressable>
            </Link>
          </View>
        </View>
      )}
    />
  );
}
