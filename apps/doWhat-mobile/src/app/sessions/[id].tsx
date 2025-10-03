import { formatDateRange, formatPrice } from "@dowhat/shared";
import { useLocalSearchParams, router } from "expo-router";
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from "react";
import { View, Text, Pressable, Image as RNImage, SafeAreaView, StatusBar, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from '@expo/vector-icons';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from "../../lib/supabase";

type Status = "going" | "interested" | "declined";

type SessionDetailRow = {
	id: string;
	activity_id: string | null;
	starts_at: string;
	ends_at: string;
	price_cents: number | null;
	activities: { id?: string | null; name?: string | null } | null;
	venues: { name?: string | null; lat?: number | null; lng?: number | null } | null;
};

type RsvpStatusRow = { status: Status };
type RsvpUserRow = { user_id: string | null };
type ProfilePreviewRow = { id: string; full_name: string | null; avatar_url: string | null };
type AttendeePreview = { id: string; initial: string; avatarUrl: string | null };

export default function SessionDetails() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const [row, setRow] = useState<SessionDetailRow | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<Status | null>(null);
	const [loading, setLoading] = useState(false);
	const [userId, setUserId] = useState<string | null>(null);
	const [msg, setMsg] = useState<string | null>(null);
	const [goingCount, setGoingCount] = useState<number | null>(null);
	const [interestedCount, setInterestedCount] = useState<number | null>(null);
	const [attendees, setAttendees] = useState<AttendeePreview[]>([]);

	useEffect(() => {
		let mounted = true;
		let channel: RealtimeChannel | null = null;
		(async () => {
			const { data, error: sessionError } = await supabase
				.from("sessions")
				.select("id, activity_id, starts_at, ends_at, price_cents, activities(id,name), venues(name,lat,lng)")
				.eq("id", id)
				.maybeSingle<SessionDetailRow>();

			if (sessionError) {
				if (mounted) setError(sessionError.message);
				return;
			}
			const sessionRow = data ?? null;
			if (mounted) setRow(sessionRow);

			const { data: auth } = await supabase.auth.getUser();
			const uid = auth?.user?.id ?? null;
			if (mounted) setUserId(uid);

			const activityId = sessionRow?.activity_id
				?? sessionRow?.activities?.id
				?? sessionRow?.id
				?? null;
			if (!activityId) {
				if (mounted) setError('Missing activity identifier');
				return;
			}

			// fetch current RSVP if signed in
			if (uid) {
				const { data: rsvp, error: rsvpError } = await supabase
					.from("rsvps")
					.select("status")
					.eq("activity_id", activityId)
					.eq("user_id", uid)
					.maybeSingle<RsvpStatusRow>();
				if (!rsvpError) setStatus(rsvp?.status ?? null);
			}

			async function refreshCountsAndPeople(activity: string) {
				try {
					const [goingResponse, interestedResponse, goingRowsResponse] = await Promise.all([
						supabase
							.from("rsvps")
							.select("status", { count: "exact", head: true })
							.eq("activity_id", activity)
							.eq("status", "going"),
						supabase
							.from("rsvps")
							.select("status", { count: "exact", head: true })
							.eq("activity_id", activity)
							.eq("status", "interested"),
						supabase
							.from("rsvps")
							.select("user_id")
							.eq("activity_id", activity)
							.eq("status", "going"),
					]);
					if (!mounted) return;
					if (!goingResponse.error) setGoingCount(goingResponse.count ?? 0);
					if (!interestedResponse.error) setInterestedCount(interestedResponse.count ?? 0);
					if (goingRowsResponse.error) {
						setAttendees([]);
						return;
					}
					const ids = (goingRowsResponse.data ?? [])
						.map((item: RsvpUserRow) => item.user_id)
						.filter((value): value is string => typeof value === 'string' && value.length > 0);
					if (ids.length) {
						const profileResponse = await supabase
							.from('profiles')
							.select('full_name, avatar_url, id')
							.in('id', ids);
						if (!profileResponse.error) {
							const items = ((profileResponse.data ?? []) as ProfilePreviewRow[])
								.map((profile) => {
									if (!profile.id) return null;
									const name = profile.full_name?.trim() || '?';
									const initial = name.slice(0, 1).toUpperCase() || '?';
									return { id: profile.id, initial, avatarUrl: profile.avatar_url ?? null };
								})
								.filter((item): item is AttendeePreview => Boolean(item));
							setAttendees(items);
						}
					} else {
						setAttendees([]);
					}
				} catch {}
			}

			await refreshCountsAndPeople(activityId);

			channel = supabase
				.channel(`rsvps:activity:${activityId}`)
				.on('postgres_changes', { event: '*', schema: 'public', table: 'rsvps', filter: `activity_id=eq.${activityId}` }, () => refreshCountsAndPeople(activityId))
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
		} catch (error) {
			setError(error instanceof Error ? error.message : "Something went wrong");
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
					{row?.venues?.lat != null && row.venues?.lng != null && (
						<Pressable style={{ marginTop: 8 }} onPress={() => {
							const { lat, lng } = row.venues ?? {};
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
								{attendees.slice(0, 8).map((person) => (
									person.avatarUrl ? (
										<RNImage key={person.id} source={{ uri: person.avatarUrl }} style={{ width: 24, height: 24, borderRadius: 12 }} />
									) : (
										<View key={person.id} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(13,148,136,0.1)', alignItems: 'center', justifyContent: 'center' }}>
											<Text style={{ fontSize: 12, fontWeight: '700', color: '#0d9488' }}>{person.initial}</Text>
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
