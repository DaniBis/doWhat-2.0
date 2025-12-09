import { formatDateRange, formatPrice, buildSessionSavePayload, type SavePayload, type ActivityRow } from "@dowhat/shared";
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, Image as RNImage, SafeAreaView, StatusBar, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from '@expo/vector-icons';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from "../../lib/supabase";
import { startGoogleSignIn } from "../../lib/auth";
import { fetchAttendanceSummary, joinSessionAttendance, type AttendanceStatus } from "../../lib/sessionAttendance";
import { useSavedActivities } from "../../../contexts/SavedActivitiesContext";

type SessionDetailRow = {
	id: string;
	activity_id: string | null;
	starts_at: string;
	ends_at: string;
	price_cents: number | null;
	max_attendees: number | null;
	visibility?: "public" | "friends" | "private" | null;
	host_user_id?: string | null;
	description?: string | null;
	activities: { id?: string | null; name?: string | null } | null;
	venues: { id?: string | null; name?: string | null; address?: string | null; lat?: number | null; lng?: number | null } | null;
};

type AttendanceRow = { user_id: string | null; status: AttendanceStatus };
type ProfilePreviewRow = { id: string; full_name: string | null; avatar_url: string | null };
type AttendeePreview = { id: string; initial: string; avatarUrl: string | null };

export default function SessionDetails() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const [row, setRow] = useState<SessionDetailRow | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<AttendanceStatus | null>(null);
	const [loading, setLoading] = useState(false);
	const [userId, setUserId] = useState<string | null>(null);
	const [msg, setMsg] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [goingCount, setGoingCount] = useState<number | null>(null);
	const [interestedCount, setInterestedCount] = useState<number | null>(null);
	const [maxAttendees, setMaxAttendees] = useState<number | null>(null);
	const [goingAttendees, setGoingAttendees] = useState<AttendeePreview[]>([]);
	const [interestedAttendees, setInterestedAttendees] = useState<AttendeePreview[]>([]);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
	const mountedRef = useRef(true);
	const { isSaved, toggle, pendingIds } = useSavedActivities();

	const savePayload = useMemo<SavePayload | null>(() => {
		if (!row) return null;
		const activityRow: ActivityRow = {
			id: row.id,
			price_cents: row.price_cents,
			starts_at: row.starts_at,
			ends_at: row.ends_at,
			activities: {
				id: row.activity_id ?? row.activities?.id ?? undefined,
				name: row.activities?.name ?? null,
			},
			venues: {
				name: row.venues?.name ?? null,
			},
		};
		const payload = buildSessionSavePayload(activityRow, { source: 'mobile_session_detail' });
		if (!payload) return null;
		return {
			...payload,
			venueId: row.venues?.id ?? payload.venueId,
			address: row.venues?.address ?? payload.address,
			metadata: {
				...(payload.metadata ?? {}),
				sessionVisibility: row.visibility ?? null,
			},
		};
	}, [row]);

	const savePending = savePayload ? pendingIds.has(savePayload.id) : false;
	const saved = savePayload ? isSaved(savePayload.id) : false;

useEffect(() => {
	return () => {
		mountedRef.current = false;
	};
}, []);

useEffect(() => {
	setSaveFeedback(null);
}, [row?.id]);

const refreshAttendeePreview = useCallback(async (sessionIdentifier: string) => {
	try {
		const { data: attendeeRows, error: attendeeError } = await supabase
			.from("session_attendees")
			.select("user_id,status")
			.eq("session_id", sessionIdentifier)
			.in("status", ["going", "interested"]);

		if (attendeeError) throw attendeeError;
		if (!mountedRef.current) return;

		const rows = Array.isArray(attendeeRows) ? attendeeRows : [];
		const goingIds: string[] = [];
		const interestedIds: string[] = [];

		rows.forEach((entry: AttendanceRow) => {
			if (!entry?.user_id || !entry?.status) return;
			if (entry.status === "going") goingIds.push(entry.user_id);
			if (entry.status === "interested") interestedIds.push(entry.user_id);
		});

		const uniqueIds = Array.from(new Set([...goingIds, ...interestedIds]));
		if (uniqueIds.length === 0) {
			setGoingAttendees([]);
			setInterestedAttendees([]);
			return;
		}

		const { data: profileRows, error: profileError } = await supabase
			.from("profiles")
			.select("id, full_name, avatar_url")
			.in("id", uniqueIds)
			.limit(50);

		if (profileError) throw profileError;
		if (!mountedRef.current) return;

		const profileMap = new Map<string, ProfilePreviewRow>();
		(profileRows ?? []).forEach((profile) => {
			if (profile?.id) profileMap.set(profile.id, profile);
		});

		const makeInitial = (profile: ProfilePreviewRow | undefined, fallbackId: string) => {
			const source = profile?.full_name?.trim() || fallbackId;
			return (source?.charAt(0)?.toUpperCase() ?? "?");
		};

		const toPreview = (ids: string[]): AttendeePreview[] =>
			ids.map((attendeeId) => {
				const profile = profileMap.get(attendeeId);
				return {
					id: attendeeId,
					initial: makeInitial(profile, attendeeId),
					avatarUrl: profile?.avatar_url ?? null,
				};
			});

		setGoingAttendees(toPreview(goingIds));
		setInterestedAttendees(toPreview(interestedIds));
	} catch (err) {
		if (__DEV__) console.error("[sessions][details] attendee preview", err);
	}
}, []);

const refreshAttendanceSummary = useCallback(async (sessionIdentifier: string) => {
	try {
		const summary = await fetchAttendanceSummary(sessionIdentifier);
		if (!mountedRef.current) return;
		setGoingCount(summary?.counts?.going ?? null);
		setInterestedCount(summary?.counts?.interested ?? null);
		setMaxAttendees(summary?.maxAttendees ?? null);
		setStatus(summary?.status ?? null);
	} catch (err) {
		if (__DEV__) console.error("[sessions][details] attendance summary", err);
	}
}, []);

const refreshAttendance = useCallback(async (sessionIdentifier: string) => {
	await Promise.all([
		refreshAttendanceSummary(sessionIdentifier),
		refreshAttendeePreview(sessionIdentifier),
	]);
}, [refreshAttendanceSummary, refreshAttendeePreview]);

useEffect(() => {
	let cancelled = false;
	(async () => {
		const { data, error: sessionError } = await supabase
			.from("sessions")
			.select("id, activity_id, starts_at, ends_at, price_cents, max_attendees, visibility, host_user_id, description, activities(id,name), venues(id,name,address,lat:lat,lng:lng)")
			.eq("id", id)
			.maybeSingle<SessionDetailRow>();

		if (sessionError) {
			if (!cancelled) setError(sessionError.message);
			return;
		}
		const sessionRow = data ?? null;
		if (!cancelled) {
			setRow(sessionRow);
			setSessionId(sessionRow?.id ?? null);
			setMaxAttendees(sessionRow?.max_attendees ?? null);
		}

		const { data: auth } = await supabase.auth.getUser();
		const uid = auth?.user?.id ?? null;
		if (!cancelled) setUserId(uid);
	})();
	return () => {
		cancelled = true;
	};
}, [id]);

useEffect(() => {
	if (!sessionId) return;
	let active = true;
	let channel: RealtimeChannel | null = null;

	(async () => {
		await refreshAttendance(sessionId);
	})();

	channel = supabase
		.channel(`session_attendees:session:${sessionId}`)
		.on(
			'postgres_changes',
			{ event: '*', schema: 'public', table: 'session_attendees', filter: `session_id=eq.${sessionId}` },
			() => {
				if (active) {
					refreshAttendance(sessionId);
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
}, [refreshAttendance, sessionId]);

	const handleSignIn = useCallback(async () => {
		try {
			await startGoogleSignIn();
		} catch (authError) {
			if (__DEV__) console.error('[sessions][details] sign-in failed', authError);
		}
	}, []);

	const handleToggleSave = useCallback(async () => {
		if (!savePayload) return;
		setSaveFeedback(null);
		const wasSaved = isSaved(savePayload.id);
		try {
			await toggle(savePayload);
			if (!mountedRef.current) return;
			setSaveFeedback({ type: 'success', message: wasSaved ? 'Removed from Saved.' : 'Saved for later.' });
		} catch (err) {
			if (!mountedRef.current) return;
			const message = err instanceof Error ? err.message : 'Unable to update saved activities.';
			setSaveFeedback({ type: 'error', message });
		}
	}, [isSaved, savePayload, toggle]);

	const isSessionFull = maxAttendees != null && (goingCount ?? 0) >= maxAttendees;
	const isGoing = status === "going";
	const disableGoingButton = loading || isGoing || (isSessionFull && !isGoing);
	const disableInterestedButton = loading || status === "interested";
	const saveButtonColor = saved ? '#065f46' : '#0d9488';
	const saveIcon = saved ? 'bookmark' : 'bookmark-outline';

	async function updateAttendance(next: AttendanceStatus) {
		if (loading) return;
		setLoading(true);
		setMsg(null);
		setActionError(null);
		try {
			if (next !== "going" && next !== "interested") {
				throw new Error("Unsupported response.");
			}

			const targetSessionId = sessionId ?? row?.id ?? null;
			if (!targetSessionId) throw new Error("Missing session id.");

			const alreadyGoing = status === "going";
			if (next === "going" && isSessionFull && !alreadyGoing) {
				throw new Error("This session is full.");
			}

			const result = await joinSessionAttendance(targetSessionId, next);
			setStatus(result.status ?? null);
			setGoingCount(result.counts?.going ?? null);
			setInterestedCount(result.counts?.interested ?? null);
			setMsg(next === "going" ? "You're going! 🎉" : "Marked interested.");
			await refreshAttendeePreview(targetSessionId);
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Something went wrong");
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
					{savePayload && (
						<>
							<Pressable
								onPress={handleToggleSave}
								disabled={savePending}
								style={{
									marginTop: 12,
									alignSelf: 'flex-start',
									paddingVertical: 10,
									paddingHorizontal: 16,
									borderRadius: 9999,
									borderWidth: 1,
									borderColor: saveButtonColor,
									backgroundColor: saved ? '#ecfdf5' : '#ffffff',
									opacity: savePending ? 0.6 : 1,
									flexDirection: 'row',
									alignItems: 'center',
									gap: 8,
								}}
							>
								<Ionicons name={saveIcon} size={16} color={saveButtonColor} />
								<Text style={{ color: saveButtonColor, fontWeight: '600' }}>{saved ? 'Saved' : 'Save'}</Text>
							</Pressable>
							{saveFeedback && (
								<Text
									style={{
										marginTop: 6,
										color: saveFeedback.type === 'success' ? '#065f46' : '#b91c1c',
									}}
								>
									{saveFeedback.message}
								</Text>
							)}
						</>
					)}
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
						<Text>Your attendance: <Text style={{ fontWeight: '700' }}>{status ?? 'not set'}</Text></Text>
						{!userId ? (
							<Pressable onPress={handleSignIn} style={{ marginTop: 8, padding: 10, borderWidth: 1, borderRadius: 8 }}>
								<Text>Sign in to update attendance</Text>
							</Pressable>
						) : (
				<View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
					<Pressable
								onPress={() => updateAttendance('going')}
									disabled={disableGoingButton}
									style={{ padding: 10, borderRadius: 8, backgroundColor: '#16a34a', opacity: disableGoingButton ? 0.6 : 1 }}
					>
						<Text style={{ color: 'white' }}>I'm going</Text>
					</Pressable>
					<Pressable
								onPress={() => updateAttendance('interested')}
									disabled={disableInterestedButton}
									style={{ padding: 10, borderRadius: 8, borderWidth: 1, opacity: disableInterestedButton ? 0.6 : 1 }}
					>
						<Text>I'm interested</Text>
					</Pressable>
				</View>
						)}
						{msg && <Text style={{ marginTop: 8, color: '#065f46' }}>{msg}</Text>}
						{actionError && <Text style={{ marginTop: 8, color: '#b91c1c' }}>{actionError}</Text>}
						{isSessionFull && status !== 'going' && (
							<Text style={{ marginTop: 8, color: '#b45309' }}>This session is full.</Text>
						)}
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
