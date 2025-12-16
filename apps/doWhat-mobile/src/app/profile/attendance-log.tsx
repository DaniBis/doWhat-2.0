import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  theme,
  trackReliabilityDisputeHistoryViewed,
  trackReliabilityDisputeHistoryFailed,
  type ReliabilityDisputeHistoryViewedPayload,
} from '@dowhat/shared';

import { supabase } from '../../lib/supabase';
import { fetchAttendanceDisputes, type AttendanceDisputeHistoryItem } from '../../lib/attendanceDispute';
import type { AttendanceStatus } from '../../lib/sessionAttendance';

const DISPUTE_STATUS_META: Record<AttendanceDisputeHistoryItem['status'], { label: string; backgroundColor: string; textColor: string }> = {
  open: { label: 'Open', backgroundColor: '#fff7ed', textColor: '#9a3412' },
  reviewing: { label: 'Reviewing', backgroundColor: '#e0f2fe', textColor: '#075985' },
  resolved: { label: 'Resolved', backgroundColor: '#ecfdf5', textColor: '#065f46' },
  dismissed: { label: 'Dismissed', backgroundColor: '#f3f4f6', textColor: '#374151' },
};

type SessionRow = {
  id: string;
  starts_at: string | null;
  ends_at: string | null;
  activities?: { name?: string | null } | null;
  venues?: { name?: string | null } | null;
};

type SessionAttendeeRow = {
  session_id: string;
  status: AttendanceStatus;
  sessions: SessionRow | SessionRow[] | null;
};

type AttendanceEntry = {
  id: string;
  title: string;
  venue: string;
  startsAt: string | null;
  endsAt: string | null;
  status: AttendanceStatus;
};

function resolveSession(raw: SessionRow | SessionRow[] | null): SessionRow | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return raw[0] ?? null;
  }
  return raw;
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Schedule TBD';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Schedule TBD';
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function describeDisputeStatus(entry: AttendanceDisputeHistoryItem) {
  const token = DISPUTE_STATUS_META[entry.status] ?? DISPUTE_STATUS_META.open;
  return { ...token };
}

export default function ProfileAttendanceLogScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [disputes, setDisputes] = useState<AttendanceDisputeHistoryItem[]>([]);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [disputeLoading, setDisputeLoading] = useState(false);

  const disputeBySession = useMemo(() => {
    const map = new Map<string, AttendanceDisputeHistoryItem>();
    disputes.forEach((entry) => {
      const existing = map.get(entry.sessionId);
      if (!existing) {
        map.set(entry.sessionId, entry);
        return;
      }
      const existingDate = Date.parse(existing.createdAt);
      const entryDate = Date.parse(entry.createdAt);
      if (Number.isNaN(existingDate) || entryDate >= existingDate) {
        map.set(entry.sessionId, entry);
      }
    });
    return map;
  }, [disputes]);

  const loadEntries = useCallback(async (uid: string) => {
    const { data, error: fetchError } = await supabase
      .from('session_attendees')
      .select('session_id,status,sessions(id,starts_at,ends_at,activities(name),venues(name))')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(100);

    if (fetchError) {
      throw fetchError;
    }

    const rows = (data ?? []) as SessionAttendeeRow[];
    const normalized = rows
      .map((row) => {
        const session = resolveSession(row.sessions);
        if (!session) return null;
        return {
          id: session.id,
          title: session.activities?.name ?? 'Activity',
          venue: session.venues?.name ?? 'Venue',
          startsAt: session.starts_at ?? null,
          endsAt: session.ends_at ?? null,
          status: row.status,
        } satisfies AttendanceEntry;
      })
      .filter((value): value is AttendanceEntry => value !== null);

    setEntries(normalized);
  }, []);

  const refreshDisputeHistory = useCallback(async (
    source: ReliabilityDisputeHistoryViewedPayload['source'] = 'auto-load'
  ) => {
    setDisputeLoading(true);
    setDisputeError(null);
    try {
      const history = await fetchAttendanceDisputes();
      setDisputes(history);
      trackReliabilityDisputeHistoryViewed({
        platform: 'mobile',
        surface: 'profile-attendance-log',
        disputes: history.length,
        source,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load dispute history.';
      setDisputeError(message);
      setDisputes([]);
      trackReliabilityDisputeHistoryFailed({
        platform: 'mobile',
        surface: 'profile-attendance-log',
        source,
        error: message,
      });
    } finally {
      setDisputeLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: auth } = await supabase.auth.getUser();
      if (cancelled) return;
      const uid = auth?.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        setEntries([]);
        setError('Please sign in to view your attendance log.');
        setLoading(false);
        return;
      }
      try {
        await loadEntries(uid);
        await refreshDisputeHistory('auto-load');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load attendance history.';
        setError(message);
        setEntries([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadEntries, refreshDisputeHistory]);

  const handleRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      await loadEntries(userId);
      await refreshDisputeHistory('manual-refresh');
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to refresh attendance.';
      setError(message);
    } finally {
      setRefreshing(false);
    }
  }, [userId, loadEntries, refreshDisputeHistory]);

  const openSession = useCallback(
    (sessionId: string) => {
      router.push({ pathname: '/sessions/[id]', params: { id: sessionId } });
    },
    [router],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
        <Pressable onPress={() => router.back()} style={{ padding: 8, marginRight: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={theme.colors.brandInk} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.brandInk }}>Attendance log</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.brandTeal} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={theme.colors.brandTeal} />
            <Text style={{ marginTop: 8, color: '#475569' }}>Loading attendance…</Text>
          </View>
        ) : error ? (
          <View style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, borderRadius: 12, padding: 16 }}>
            <Text style={{ color: '#b91c1c', fontWeight: '600' }}>{error}</Text>
            {userId && (
              <Pressable onPress={handleRefresh} style={{ marginTop: 12, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.brandTeal, paddingHorizontal: 16, paddingVertical: 8 }}>
                <Text style={{ color: theme.colors.brandTeal, fontWeight: '600', textAlign: 'center' }}>Try again</Text>
              </Pressable>
            )}
          </View>
        ) : entries.length === 0 ? (
          <Text style={{ color: '#475569', fontSize: 15 }}>You have no attendance history yet.</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {entries.map((entry) => {
              const endedAt = entry.endsAt ? new Date(entry.endsAt) : null;
              const ended = endedAt ? endedAt.getTime() <= Date.now() : false;
              const canContest = ended && entry.status === 'going';
              const dispute = disputeBySession.get(entry.id);
              const disputeMeta = dispute ? describeDisputeStatus(dispute) : null;

              return (
                <View key={entry.id} style={{ borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', padding: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.brandInk }}>{entry.title}</Text>
                  <Text style={{ color: '#475569', marginTop: 2 }}>{entry.venue}</Text>
                  <Text style={{ color: '#94a3b8', marginTop: 6 }}>Starts: {formatDateTime(entry.startsAt)}</Text>
                  {entry.endsAt && <Text style={{ color: '#94a3b8' }}>Ended: {formatDateTime(entry.endsAt)}</Text>}
                  <Text style={{ marginTop: 8, color: '#111827' }}>Status: <Text style={{ fontWeight: '700' }}>{entry.status}</Text></Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                    <Pressable
                      onPress={() => openSession(entry.id)}
                      style={{ borderRadius: 999, borderWidth: 1, borderColor: '#cbd5f5', paddingHorizontal: 16, paddingVertical: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Open session details"
                    >
                      <Text style={{ color: theme.colors.brandTeal, fontWeight: '600' }}>View session</Text>
                    </Pressable>
                    {canContest ? (
                      <Text style={{ flex: 1, color: '#0f172a', fontSize: 12 }}>Head to the session page to contest this result.</Text>
                    ) : (
                      <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>
                        {entry.status !== 'going' ? 'Only confirmed attendees can contest reliability.' : 'Contests open after the session ends.'}
                      </Text>
                    )}
                  </View>
                  {disputeMeta && (
                    <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: '#475569', fontSize: 12 }}>Dispute status:</Text>
                      <View style={{ backgroundColor: disputeMeta.backgroundColor, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
                        <Text style={{ color: disputeMeta.textColor, fontWeight: '600', fontSize: 12 }}>{disputeMeta.label}</Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={{ marginTop: 32 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.brandInk }}>Dispute history</Text>
              <Text style={{ color: '#64748b', fontSize: 13 }}>Past reliability disputes and their status.</Text>
            </View>
            <Pressable
              onPress={() => refreshDisputeHistory('manual-refresh')}
              disabled={disputeLoading}
              style={{ borderRadius: 999, borderWidth: 1, borderColor: '#cbd5f5', paddingHorizontal: 14, paddingVertical: 6, opacity: disputeLoading ? 0.6 : 1 }}
            >
              <Text style={{ color: theme.colors.brandInk, fontWeight: '600' }}>{disputeLoading ? 'Refreshing…' : 'Refresh'}</Text>
            </Pressable>
          </View>
          {disputeError && <Text style={{ color: '#b91c1c' }}>{disputeError}</Text>}
          {!disputeError && disputeLoading && disputes.length === 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <ActivityIndicator size="small" color={theme.colors.brandTeal} />
              <Text style={{ color: '#475569', fontSize: 13 }}>Loading dispute history…</Text>
            </View>
          )}
          {!disputeLoading && !disputeError && disputes.length === 0 && (
            <Text style={{ color: '#94a3b8', fontSize: 13 }}>You haven’t filed any disputes yet.</Text>
          )}
          {!disputeError && disputes.length > 0 && (
            <View style={{ marginTop: 12, gap: 10 }}>
              {disputes.map((entry) => {
                const meta = describeDisputeStatus(entry);
                return (
                  <View key={entry.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', padding: 14 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.brandInk }}>{entry.session.title ?? 'Session'}</Text>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>{entry.session.venue ?? 'Venue'}</Text>
                    <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>Filed {formatDateTime(entry.createdAt)}</Text>
                    <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: '#475569', fontSize: 12 }}>Status:</Text>
                      <View style={{ backgroundColor: meta.backgroundColor, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: meta.textColor, fontWeight: '600', fontSize: 12 }}>{meta.label}</Text>
                      </View>
                    </View>
                    {entry.resolutionNotes && (
                      <Text style={{ marginTop: 8, color: '#111827', fontSize: 13 }}>{entry.resolutionNotes}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
