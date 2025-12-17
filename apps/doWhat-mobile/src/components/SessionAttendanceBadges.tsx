import { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RELIABILITY_BADGE_ORDER, RELIABILITY_BADGE_TOKENS, type ReliabilityBadgeKey } from '@dowhat/shared';

import { supabase } from '../lib/supabase';
import { fetchAttendanceSummary } from '../lib/sessionAttendance';

export default function SessionAttendanceBadges({ sessionId }: { sessionId?: string | null }) {
  const [going, setGoing] = useState<number | null>(null);
  const [interested, setInterested] = useState<number | null>(null);
  const [verified, setVerified] = useState<number | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let mounted = true;

    const refresh = async () => {
      try {
        const summary = await fetchAttendanceSummary(sessionId);
        if (!mounted) return;
        setGoing(summary?.counts?.going ?? 0);
        setInterested(summary?.counts?.interested ?? 0);
        setVerified(summary?.counts?.verified ?? 0);
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

  const badgeValues = useMemo<Record<ReliabilityBadgeKey, number | null>>(() => ({ going, interested, verified }), [going, interested, verified]);

  return (
    <View style={styles.container}>
      {RELIABILITY_BADGE_ORDER.map((key) => {
        const token = RELIABILITY_BADGE_TOKENS[key];
        const value = badgeValues[key];
        return (
          <View
            key={key}
            style={[styles.badge, { backgroundColor: token.backgroundColor, borderColor: token.borderColor }]}
            accessibilityRole="text"
            accessibilityLabel={`${token.label} ${typeof value === 'number' ? value : 'not available yet'}`}
          >
            <Text style={[styles.badgeText, { color: token.textColor }]}>
              {token.icon ? `${token.icon} ` : ''}
              {token.label}: {typeof value === 'number' ? value : '—'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
