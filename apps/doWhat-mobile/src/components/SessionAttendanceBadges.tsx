import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';

import { supabase } from '../lib/supabase';
import { fetchAttendanceSummary } from '../lib/sessionAttendance';

export default function SessionAttendanceBadges({ sessionId }: { sessionId?: string | null }) {
  const [going, setGoing] = useState<number | null>(null);
  const [interested, setInterested] = useState<number | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let mounted = true;

    const refresh = async () => {
      try {
        const summary = await fetchAttendanceSummary(sessionId);
        if (!mounted) return;
        setGoing(summary?.counts?.going ?? 0);
        setInterested(summary?.counts?.interested ?? 0);
      } catch (err) {
        if (__DEV__) console.error('[SessionAttendanceBadges] summary refresh', err);
      }
    };

    refresh();

    const channel = supabase
      .channel(`session_attendees:session:${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_attendees', filter: `session_id=eq.${sessionId}` },
        () => refresh(),
      )
      .subscribe();

    return () => {
      mounted = false;
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [sessionId]);

  if (!sessionId) return null;

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
