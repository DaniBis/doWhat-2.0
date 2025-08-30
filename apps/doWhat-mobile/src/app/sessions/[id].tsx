import { useLocalSearchParams } from "expo-router";
import { View, Text, Pressable } from "react-native";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { formatDateRange, formatPrice } from "@dowhat/shared";
import * as AuthSession from "expo-auth-session";
import * as Linking from "expo-linking";
import { Link } from "expo-router";

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("activities_view") // or "sessions" if you prefer
        .select("*")
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

      // counts for going/interested
      try {
        const [{ count: going }, { count: interested }] = await Promise.all([
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
        ]);
        if (mounted) {
          setGoingCount(going ?? 0);
          setInterestedCount(interested ?? 0);
        }
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  async function signIn() {
    const redirectTo = AuthSession.makeRedirectUri({ scheme: "dowhat" });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (!error && data?.url) await Linking.openURL(data.url);
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

  if (error) return <Text style={{ padding: 16, color: "red" }}>Error: {error}</Text>;
  if (!row) return <Text style={{ padding: 16 }}>Loading…</Text>;

  return (
    <View style={{ padding: 16 }}>
      <Link href="/" asChild>
        <Pressable><Text style={{ color: '#0d9488' }}>&larr; Back</Text></Pressable>
      </Link>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>{row.activities?.name ?? "Activity"}</Text>
      <Text style={{ marginTop: 6 }}>{row.venues?.name ?? "Venue"}</Text>
      <Text style={{ marginTop: 6 }}>{formatPrice(row.price_cents)}</Text>
      <Text style={{ marginTop: 6 }}>{formatDateRange(row.starts_at, row.ends_at)}</Text>
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
              <Text style={{ color: 'white' }}>I’m going</Text>
            </Pressable>
            <Pressable
              onPress={() => doRsvp('interested')}
              disabled={loading || status === 'interested'}
              style={{ padding: 10, borderRadius: 8, borderWidth: 1, opacity: loading || status === 'interested' ? 0.6 : 1 }}
            >
              <Text>I’m interested</Text>
            </Pressable>
            <Pressable
              onPress={() => doRsvp('declined')}
              disabled={loading || status === 'declined'}
              style={{ padding: 10, borderRadius: 8, borderWidth: 1, opacity: loading || status === 'declined' ? 0.6 : 1 }}
            >
              <Text>Can’t make it</Text>
            </Pressable>
          </View>
        )}
        {msg && <Text style={{ marginTop: 8, color: '#065f46' }}>{msg}</Text>}
        {error && <Text style={{ marginTop: 8, color: '#b91c1c' }}>{error}</Text>}
        <Text style={{ marginTop: 8, color: '#374151' }}>
          Going: {goingCount ?? '—'}   Interested: {interestedCount ?? '—'}
        </Text>
      </View>
    </View>
  );
}
