import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';

import { startGoogleSignIn } from '../lib/auth';
import { supabase } from '../lib/supabase';
import {
  fetchAttendanceSummary,
  joinSessionAttendance,
  type AttendanceCounts,
  type AttendanceStatus,
} from '../lib/sessionAttendance';

const DEFAULT_COUNTS: AttendanceCounts = { going: 0, interested: 0, declined: 0, total: 0, verified: 0 };

type Props = {
  sessionId?: string | null;
  size?: 'default' | 'compact';
  style?: ViewStyle;
};

export default function SessionAttendanceQuickActions({ sessionId, size = 'default', style }: Props) {
  const [status, setStatus] = useState<AttendanceStatus>(null);
  const [counts, setCounts] = useState<AttendanceCounts>(DEFAULT_COUNTS);
  const [maxAttendees, setMaxAttendees] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!cancelled) {
          setUserId(data?.user?.id ?? null);
        }
      } catch (authError) {
        if (__DEV__) console.warn('[SessionAttendanceQuickActions] getUser failed', authError);
      }
    })();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mountedRef.current) return;
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const refreshSummary = useCallback(async () => {
    if (!sessionId) return;
    try {
      const summary = await fetchAttendanceSummary(sessionId);
      if (!mountedRef.current) return;
      setStatus(summary?.status ?? null);
      setCounts(summary?.counts ?? DEFAULT_COUNTS);
      setMaxAttendees(summary?.maxAttendees ?? null);
    } catch (err) {
      if (__DEV__) console.warn('[SessionAttendanceQuickActions] summary load failed', err);
      if (!mountedRef.current) return;
      setError('Unable to load attendance.');
    }
  }, [sessionId]);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`session_attendance_quick_actions:${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_attendees', filter: `session_id=eq.${sessionId}` },
        () => {
          refreshSummary();
        },
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [refreshSummary, sessionId]);

  const isFull = useMemo(() => {
    if (status === 'going') return false;
    if (maxAttendees == null) return false;
    return (counts?.going ?? 0) >= maxAttendees;
  }, [counts?.going, maxAttendees, status]);

  const disableGoing = loading || status === 'going' || isFull;
  const disableInterested = loading || status === 'interested';

  const handleMutate = useCallback(
    async (next: 'going' | 'interested') => {
      if (!sessionId || loading) return;
      if (!userId) {
        setError('Sign in to save your spot.');
        return;
      }
      setLoading(true);
      setMessage(null);
      setError(null);
      try {
        const result = await joinSessionAttendance(sessionId, next);
        if (!mountedRef.current) return;
        setStatus(result?.status ?? null);
        setCounts(result?.counts ?? DEFAULT_COUNTS);
        setMessage(next === 'going' ? "You're going!" : 'Marked interested.');
      } catch (err) {
        if (!mountedRef.current) return;
        const readable = err instanceof Error ? err.message : 'Unable to update attendance.';
        setError(readable);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [loading, sessionId, userId],
  );

  const handleSignIn = useCallback(async () => {
    setError(null);
    try {
      await startGoogleSignIn();
      const { data } = await supabase.auth.getUser();
      setUserId(data?.user?.id ?? null);
      await refreshSummary();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Unable to sign in.');
    }
  }, [refreshSummary]);

  if (!sessionId) {
    return null;
  }

  if (!userId) {
    return (
      <Pressable
        onPress={handleSignIn}
        style={{
          marginTop: 10,
          paddingVertical: size === 'compact' ? 6 : 10,
          paddingHorizontal: 16,
          borderWidth: 1,
          borderColor: '#10B981',
          borderRadius: 999,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#047857', fontWeight: '600' }}>Sign in to update attendance</Text>
      </Pressable>
    );
  }

  const sharedButtonStyle: ViewStyle = {
    flex: 1,
    paddingVertical: size === 'compact' ? 6 : 10,
    borderRadius: 999,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  };

  return (
    <View style={style}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => handleMutate('going')}
          disabled={disableGoing}
          style={[
            sharedButtonStyle,
            {
              backgroundColor: '#10B981',
              opacity: disableGoing ? 0.6 : 1,
            },
          ]}
        >
          {loading && (
            <ActivityIndicator color="#ffffff" size="small" style={{ marginRight: 6 }} />
          )}
          <Text style={{ color: '#fff', fontWeight: '600' }}>
            {status === 'going' ? "You're going" : isFull ? 'Full' : "I'm going"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => handleMutate('interested')}
          disabled={disableInterested}
          style={[
            sharedButtonStyle,
            {
              borderWidth: 1,
              borderColor: '#D1FAE5',
              backgroundColor: '#fff',
              opacity: disableInterested ? 0.6 : 1,
            },
          ]}
        >
          {loading && (
            <ActivityIndicator color="#059669" size="small" style={{ marginRight: 6 }} />
          )}
          <Text style={{ color: '#047857', fontWeight: '600' }}>
            {status === 'interested' ? 'Interested' : "I'm interested"}
          </Text>
        </Pressable>
      </View>
      {isFull && status !== 'going' && (
        <Text style={{ marginTop: 6, color: '#b45309', fontSize: 12 }}>This session is full.</Text>
      )}
      {message && <Text style={{ marginTop: 6, color: '#047857', fontSize: 12 }}>{message}</Text>}
      {error && <Text style={{ marginTop: 6, color: '#b91c1c', fontSize: 12 }}>{error}</Text>}
    </View>
  );
}
