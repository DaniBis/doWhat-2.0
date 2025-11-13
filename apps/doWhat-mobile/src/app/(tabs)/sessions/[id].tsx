import { formatDateRange, formatPrice } from "@dowhat/shared";
import { useLocalSearchParams, router } from "expo-router";
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from "react";
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
const [goingAttendees, setGoingAttendees] = useState<AttendeePreview[]>([]);
const [interestedAttendees, setInterestedAttendees] = useState<AttendeePreview[]>([]);
const [activityId, setActivityId] = useState<string | null>(null);
const mountedRef = useRef(true);

useEffect(() => {
	return () => {
		mountedRef.current = false;
	};
}, []);

const updateAttendance = useCallback(async (activity: string) => {
	try {
		const { data: rsvpRows, error: rsvpError } = await supabase
			.from("rsvps")
			.select("user_id,status")
			.eq("activity_id", activity)
			.in("status", ["going", "interested"]);

		if (!mountedRef.current) return;

		if (rsvpError) {
			setGoingCount(null);
			setInterestedCount(null);
			setGoingAttendees([]);
			setInterestedAttendees([]);
			return;
		}

		const rows = Array.isArray(rsvpRows) ? rsvpRows : [];
		const goingIds: string[] = [];
		const interestedIds: string[] = [];

		rows.forEach((entry: RsvpUserRow & RsvpStatusRow) => {
			const user = typeof entry.user_id === "string" ? entry.user_id : null;
			if (!user) return;
			if (entry.status === "going" && !goingIds.includes(user)) {
				goingIds.push(user);
			}
			if (entry.status === "interested" && !interestedIds.includes(user)) {
				interestedIds.push(user);
			}
		});

		setGoingCount(goingIds.length);
		setInterestedCount(interestedIds.length);

		const uniqueIds = Array.from(new Set([...goingIds, ...interestedIds]));
		if (!uniqueIds.length) {
			setGoingAttendees([]);
			setInterestedAttendees([]);
			return;
		}

		const { data: profileRows, error: profileError } = await supabase
			.from("profiles")
			.select("full_name, avatar_url, id")
			.in("id", uniqueIds);

		if (!mountedRef.current) return;

		if (profileError) {
			setGoingAttendees([]);
			setInterestedAttendees([]);
			return;
		}

		const profileMap = new Map<string, ProfilePreviewRow>();
		(profileRows ?? []).forEach((profile: ProfilePreviewRow) => {
			if (profile?.id) {
				profileMap.set(profile.id, profile);
			}
		});

		const toPreview = (ids: string[]): AttendeePreview[] =>
			ids
				.map((identifier) => {
					const profile = profileMap.get(identifier);
					const name = profile?.full_name?.trim() || "?";
					const initial = name.slice(0, 1).toUpperCase() || "?";
					return {
						id: identifier,
						initial,
						avatarUrl: profile?.avatar_url ?? null,
					};
				})
				.filter((item): item is AttendeePreview => Boolean(item))
				.sort((a, b) => a.initial.localeCompare(b.initial));

		setGoingAttendees(toPreview(goingIds));
		setInterestedAttendees(toPreview(interestedIds));
	} catch {
		if (!mountedRef.current) return;
		setGoingCount(null);
		setInterestedCount(null);
		setGoingAttendees([]);
		setInterestedAttendees([]);
	}
}, []);

useEffect(() => {
	let cancelled = false;
	(async () => {
		const { data, error: sessionError } = await supabase
			.from("sessions")
			.select("id, activity_id, starts_at, ends_at, price_cents, activities(id,name), venues(name,lat:lat,lng:lng)")
			.eq("id", id)
			.maybeSingle<SessionDetailRow>();

		if (sessionError) {
			if (!cancelled) setError(sessionError.message);
			return;
		}
		const sessionRow = data ?? null;
		if (!cancelled) setRow(sessionRow);

		const { data: auth } = await supabase.auth.getUser();
		const uid = auth?.user?.id ?? null;
		if (!cancelled) setUserId(uid);

		const computedActivityId =
			sessionRow?.activity_id ??
			sessionRow?.activities?.id ??
			sessionRow?.id ??
			null;

		if (!computedActivityId) {
			if (!cancelled) setError('Missing activity identifier');
			return;
		}

		if (!cancelled) setActivityId(computedActivityId);

		if (uid) {
			const { data: rsvp, error: rsvpError } = await supabase
				.from("rsvps")
				.select("status")
				.eq("activity_id", computedActivityId)
				.eq("user_id", uid)
				.maybeSingle<RsvpStatusRow>();
			if (!cancelled && !rsvpError) setStatus(rsvp?.status ?? null);
		}
	})();
	return () => {
		cancelled = true;
	};
}, [id]);

useEffect(() => {
	if (!activityId) return;
	let active = true;
	let channel: RealtimeChannel | null = null;

	(async () => {
		await updateAttendance(activityId);
	})();

	channel = supabase
		.channel(`rsvps:activity:${activityId}`)
		.on(
			'postgres_changes',
			{ event: '*', schema: 'public', table: 'rsvps', filter: `activity_id=eq.${activityId}` },
			() => {
				if (active) {
					updateAttendance(activityId);
				}
			}
		)
		.subscribe();

	return () => {
		active = false;
		try {
			if (channel) supabase.removeChannel(channel);
		} catch {}
	};
}, [activityId, updateAttendance]);

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

			const targetActivityId = activityId ?? row?.activity_id ?? row?.id ?? null;
			if (!targetActivityId) throw new Error("Missing activity id.");

			const upsert = { activity_id: targetActivityId, user_id: uid, status: next };
			const { error } = await supabase
				.from("rsvps")
				.upsert(upsert, { onConflict: "activity_id,user_id" });
			if (error) throw error;

		setStatus(next);
		await updateAttendance(targetActivityId);
		setMsg(next === "going" ? "You're going! 🎉" : "Marked interested.");
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
				</View>
						)}
						{msg && <Text style={{ marginTop: 8, color: '#065f46' }}>{msg}</Text>}
						{error && <Text style={{ marginTop: 8, color: '#b91c1c' }}>{error}</Text>}
						<Text style={{ marginTop: 8, color: '#374151' }}>
							Going: {goingCount ?? '—'}   Interested: {interestedCount ?? '—'}
						</Text>
						{(goingAttendees.length > 0 || interestedAttendees.length > 0) && (
							<View style={{ marginTop: 6, gap: 12 }}>
								{goingAttendees.length > 0 && (
									<View>
										<Text style={{ fontSize: 13, fontWeight: '600', color: '#0f172a', marginBottom: 6 }}>Going</Text>
										<View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
											{goingAttendees.slice(0, 8).map((person) => (
												<TouchableOpacity
													key={`going-${person.id}`}
													onPress={() => router.push({ pathname: '/profile/[id]', params: { id: person.id } })}
													style={{ marginRight: 2 }}
												>
													{person.avatarUrl ? (
														<RNImage source={{ uri: person.avatarUrl }} style={{ width: 28, height: 28, borderRadius: 14 }} />
													) : (
														<View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(13,148,136,0.1)', alignItems: 'center', justifyContent: 'center' }}>
															<Text style={{ fontSize: 13, fontWeight: '700', color: '#0d9488' }}>{person.initial}</Text>
														</View>
													)}
												</TouchableOpacity>
											))}
											{goingAttendees.length > 8 && (
												<Text style={{ fontSize: 12, color: '#6b7280' }}>+{goingAttendees.length - 8}</Text>
											)}
										</View>
									</View>
								)}
								{interestedAttendees.length > 0 && (
									<View>
										<Text style={{ fontSize: 13, fontWeight: '600', color: '#0f172a', marginBottom: 6 }}>Interested</Text>
										<View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
											{interestedAttendees.slice(0, 8).map((person) => (
												<TouchableOpacity
													key={`interested-${person.id}`}
													onPress={() => router.push({ pathname: '/profile/[id]', params: { id: person.id } })}
													style={{ marginRight: 2 }}
												>
													{person.avatarUrl ? (
														<RNImage source={{ uri: person.avatarUrl }} style={{ width: 28, height: 28, borderRadius: 14 }} />
													) : (
														<View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(59,130,246,0.1)', alignItems: 'center', justifyContent: 'center' }}>
															<Text style={{ fontSize: 13, fontWeight: '700', color: '#1d4ed8' }}>{person.initial}</Text>
														</View>
													)}
												</TouchableOpacity>
											))}
											{interestedAttendees.length > 8 && (
												<Text style={{ fontSize: 12, color: '#6b7280' }}>+{interestedAttendees.length - 8}</Text>
											)}
										</View>
									</View>
								)}
							</View>
						)}
					</View>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}
