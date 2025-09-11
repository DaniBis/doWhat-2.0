import { formatDateRange, formatPrice } from "@dowhat/shared";
import { useLocalSearchParams, router } from "expo-router";
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from "react";
import { View, Text, Pressable, Image as RNImage, SafeAreaView, StatusBar, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from '@expo/vector-icons';

import { supabase } from "../../lib/supabase";

type Status = "going" | "interested" | "declined";

export default function SessionDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [goingCount, setGoingCount] = useState<number | null>(null);
  const [interestedCount, setInterestedCount] = useState<number | null>(null);
  const [attendees, setAttendees] = useState<{ initial: string }[]>([]);

  useEffect(() => {
    let mounted = true;
    let channel: any;
    (async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select(
          "id, activity_id, starts_at, ends_at, price_cents, activities(name), venues(name,lat,lng)"
        )
        .eq("id", id)
        .single();

      if (error) setError(error.message);
      else setRow(data);

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      if (mounted) setUserId(uid);

      // fetch current RSVP if signed in
      const activityId = (data as any)?.activity_id ?? (data as any)?.id;
      if (uid && activityId) {
        const { data: rsvp, error: rerr } = await supabase
          .from("rsvps")
          .select("status")
          .eq("activity_id", activityId)
          .eq("user_id", uid)
          .maybeSingle();
        if (!rerr && rsvp) setStatus(rsvp.status as Status);
      }

      async function refreshCountsAndPeople() {
        try {
          const [{ count: going }, { count: interested }, goingRows] = await Promise.all([
            supabase
              .from("rsvps")
              .select("status", { count: "exact", head: true })
              .eq("activity_id", activityId)
              .eq("status", "going"),
            supabase
              .from("rsvps")
              .select("status", { count: "exact", head: true })
              .eq("activity_id", activityId)
              .eq("status", "interested"),
            supabase
              .from("rsvps")
              .select("user_id")
              .eq("activity_id", activityId)
              .eq("status", "going"),
          ]);
          if (mounted) {
            setGoingCount(going ?? 0);
            setInterestedCount(interested ?? 0);
            const ids = (goingRows.data ?? []).map((r: any) => r.user_id).filter(Boolean);
            if (ids.length) {
              const { data: profiles } = await supabase
                .from('profiles')
                .select('full_name, avatar_url, id')
                .in('id', ids);
              const items = (profiles ?? []).map((p: any) => {
                const name = p.full_name || '?';
                const init = String(name).trim().slice(0, 1).toUpperCase();
                return { initial: init, avatar_url: p.avatar_url as string | null } as any;
              });
              setAttendees(items);
            } else {
              setAttendees([]);
            }
          }
        } catch {}
      }

      await refreshCountsAndPeople();

      channel = supabase
        .channel(`rsvps:activity:${activityId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rsvps', filter: `activity_id=eq.${activityId}` }, () => refreshCountsAndPeople())
        .subscribe();

      // initial preview handled in refreshCountsAndPeople
    })();
    return () => {
      mounted = false;
      try { if (channel) supabase.removeChannel(channel); } catch {}
    };
  }, [id]);

  async function signIn() {
    const redirectTo = 'dowhat://auth-callback';
    if (__DEV__) console.log('[auth][details] redirectTo', redirectTo);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (__DEV__) console.log('[auth][details] signInWithOAuth error?', error?.message);
    if (__DEV__) console.log('[auth][details] supabase auth url', data?.url);
    if (!error && data?.url) {
      if (__DEV__) console.log('[auth][details] opening browser to', data.url);
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (__DEV__) console.log('[auth][details] auth result', res);
      if (res.type === 'success' && res.url) {
        const url = res.url;
        const fragment = url.split('#')[1] || '';
        const query = url.split('?')[1] || '';
        const params = new URLSearchParams(fragment || query);
        const code = params.get('code') || undefined;
        const accessToken = params.get('access_token') || undefined;
        const refreshToken = params.get('refresh_token') || undefined;
        if (__DEV__) console.log('[auth][details] parsed params', { code, accessToken: !!accessToken, refreshToken: !!refreshToken });
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (accessToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' });
        }
      }
    }
  }

  async function doRsvp(next: Status) {
    if (loading) return;
    setLoading(true);
    setMsg(null);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("Please sign in first.");

      const activityId = row?.activity_id ?? row?.id;
      if (!activityId) throw new Error("Missing activity id.");

      const upsert = { activity_id: activityId, user_id: uid, status: next };
      const { error } = await supabase
        .from("rsvps")
        .upsert(upsert, { onConflict: "activity_id,user_id" });
      if (error) throw error;

      setStatus(next);
      setMsg(
        next === "going"
          ? "You're going! 🎉"
          : next === "interested"
          ? "Marked interested."
          : "Marked declined."
      );
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (error) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB'
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            marginRight: 16,
            padding: 8,
            marginLeft: -8
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={{
          fontSize: 18,
          fontWeight: '600',
          color: '#111827'
        }}>
          Error
        </Text>
      </View>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <Text style={{ color: "red", textAlign: 'center' }}>Error: {error}</Text>
      </View>
    </SafeAreaView>
  );
  
  if (!row) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB'
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            marginRight: 16,
            padding: 8,
            marginLeft: -8
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={{
          fontSize: 18,
          fontWeight: '600',
          color: '#111827'
        }}>
          Session
        </Text>
      </View>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Loading…</Text>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB'
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            marginRight: 16,
            padding: 8,
            marginLeft: -8
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={{
          fontSize: 18,
          fontWeight: '600',
          color: '#111827',
          flex: 1,
          textAlign: 'center',
          marginRight: 40
        }}>
          Session
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }}>
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 22, fontWeight: "700" }}>{row.activities?.name ?? "Activity"}</Text>
          <Text style={{ marginTop: 6 }}>{row.venues?.name ?? "Venue"}</Text>
          <Text style={{ marginTop: 6 }}>{formatPrice(row.price_cents)}</Text>
          <Text style={{ marginTop: 6 }}>{formatDateRange(row.starts_at, row.ends_at)}</Text>
          {row?.venues?.lat != null && row?.venues?.lng != null && (
            <Pressable style={{ marginTop: 8 }} onPress={() => {
              const lat = (row as any).venues.lat; const lng = (row as any).venues.lng;
              const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
              WebBrowser.openBrowserAsync(url);
            }}>
              <Text style={{ color: '#0d9488' }}>Open in Maps</Text>
            </Pressable>
          )}
          <View style={{ marginTop: 12 }}>
            <Text>Your status: <Text style={{ fontWeight: '700' }}>{status ?? 'no rsvp'}</Text></Text>
            {!userId ? (
              <Pressable onPress={signIn} style={{ marginTop: 8, padding: 10, borderWidth: 1, borderRadius: 8 }}>
                <Text>Sign in to RSVP</Text>
              </Pressable>
            ) : (
              <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => doRsvp('going')}
                  disabled={loading || status === 'going'}
                  style={{ padding: 10, borderRadius: 8, backgroundColor: '#16a34a', opacity: loading || status === 'going' ? 0.6 : 1 }}
                >
                  <Text style={{ color: 'white' }}>I'm going</Text>
                </Pressable>
                <Pressable
                  onPress={() => doRsvp('interested')}
                  disabled={loading || status === 'interested'}
                  style={{ padding: 10, borderRadius: 8, borderWidth: 1, opacity: loading || status === 'interested' ? 0.6 : 1 }}
                >
                  <Text>I'm interested</Text>
                </Pressable>
                <Pressable
                  onPress={() => doRsvp('declined')}
                  disabled={loading || status === 'declined'}
                  style={{ padding: 10, borderRadius: 8, borderWidth: 1, opacity: loading || status === 'declined' ? 0.6 : 1 }}
                >
                  <Text>Can't make it</Text>
                </Pressable>
              </View>
            )}
            {msg && <Text style={{ marginTop: 8, color: '#065f46' }}>{msg}</Text>}
            {error && <Text style={{ marginTop: 8, color: '#b91c1c' }}>{error}</Text>}
            <Text style={{ marginTop: 8, color: '#374151' }}>
              Going: {goingCount ?? '—'}   Interested: {interestedCount ?? '—'}
            </Text>
            {attendees.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                {attendees.slice(0, 8).map((p: any, i) => (
                  p.avatar_url ? (
                    <RNImage key={i} source={{ uri: p.avatar_url }} style={{ width: 24, height: 24, borderRadius: 12 }} />
                  ) : (
                    <View key={i} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(13,148,136,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#0d9488' }}>{p.initial}</Text>
                    </View>
                  )
                ))}
                {attendees.length > 8 && (
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>+{attendees.length - 8}</Text>
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
