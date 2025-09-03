import { formatDateRange, formatPrice } from '@dowhat/shared';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';

import { supabase } from '../../lib/supabase';


type Row = {
  session_id: string;
  starts_at: string;
  ends_at: string;
  price_cents: number | null;
  activity_id: string;
  activity_name: string;
  venue_id: string;
  venue_name: string;
  venue_lat: number | null;
  venue_lng: number | null;
  distance_km: number;
};

export default function ActivityPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      // Attempt to use nearby within 100km if we don't have cached coordinates
      const { data, error } = await supabase.rpc('sessions_nearby', {
        lat: null,
        lng: null,
        p_km: 100,
        activities: [id],
        day: null,
      });
      if (error) { setErr(error.message); return; }
      setRows((data ?? []) as Row[]);
    })();
  }, [id]);

  if (err) return <Text style={{ padding: 16, color: 'red' }}>{err}</Text>;
  if (!rows) return <Text style={{ padding: 16 }}>Loading…</Text>;

  const groups: Record<string, { venue: { id: string; name: string; lat: number | null; lng: number | null }, items: Row[] }> = {};
  for (const r of rows) {
    const key = r.venue_id;
    if (!groups[key]) groups[key] = { venue: { id: r.venue_id, name: r.venue_name, lat: r.venue_lat, lng: r.venue_lng }, items: [] };
    groups[key].items.push(r);
  }
  const venues = Object.values(groups);

  return (
    <FlatList
      contentContainerStyle={{ padding: 12, gap: 12 }}
      data={venues}
      keyExtractor={(v) => v.venue.id}
      renderItem={({ item }) => (
        <View style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '700' }}>{item.venue.name}</Text>
          {item.venue.lat != null && item.venue.lng != null && (
            <Pressable style={{ marginTop: 6 }} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${item.venue.lat},${item.venue.lng}`)}>
              <Text style={{ color: '#0d9488' }}>Open in Maps</Text>
            </Pressable>
          )}
          {item.items.map((s) => (
            <View key={s.session_id} style={{ marginTop: 8 }}>
              <Text>{formatDateRange(s.starts_at as any, s.ends_at as any)}</Text>
              {!!s.price_cents && <Text>{formatPrice(s.price_cents)}</Text>}
              <Link href={`/sessions/${s.session_id}`} asChild>
                <Pressable style={{ marginTop: 6, borderWidth: 1, borderRadius: 8, padding: 8 }}>
                  <Text>View details</Text>
                </Pressable>
              </Link>
            </View>
          ))}
        </View>
      )}
      ListHeaderComponent={
        <View style={{ margin: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '700' }}>Places for activity</Text>
          <Link href={`/add-event`} asChild>
            <Pressable style={{ marginTop: 8, borderWidth: 1, borderRadius: 8, padding: 8 }}>
              <Text>Create new event</Text>
            </Pressable>
          </Link>
        </View>
      }
    />
  );
}
