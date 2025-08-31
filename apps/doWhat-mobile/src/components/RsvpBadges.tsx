import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { supabase } from '../lib/supabase';

export default function RsvpBadges({ activityId }: { activityId?: string | null }) {
  const [going, setGoing] = useState<number | null>(null);
  const [interested, setInterested] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!activityId) return;

    async function refresh() {
      const [{ count: g }, { count: i }] = await Promise.all([
        supabase
          .from('rsvps')
          .select('status', { count: 'exact', head: true })
          .eq('activity_id', activityId)
          .eq('status', 'going'),
        supabase
          .from('rsvps')
          .select('status', { count: 'exact', head: true })
          .eq('activity_id', activityId)
          .eq('status', 'interested'),
      ]);
      if (mounted) {
        setGoing(g ?? 0);
        setInterested(i ?? 0);
      }
    }

    refresh();

    const channel = supabase
      .channel(`rsvps:activity:${activityId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rsvps', filter: `activity_id=eq.${activityId}` }, () => refresh())
      .subscribe();

    return () => {
      mounted = false;
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [activityId]);

  if (!activityId) return null;

  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
      <Text style={{ fontSize: 12, color: '#374151', backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
        Going: {going ?? '—'}
      </Text>
      <Text style={{ fontSize: 12, color: '#374151', backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
        Interested: {interested ?? '—'}
      </Text>
    </View>
  );
}
