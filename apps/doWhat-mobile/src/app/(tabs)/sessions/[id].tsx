import {
	formatDateRange,
	formatPrice,
	buildSessionSavePayload,
	type SavePayload,
	type ActivityRow,
	trackReliabilityContestOpened,
	trackReliabilityDisputeHistoryViewed,
	trackReliabilityDisputeHistoryFailed,
	type ReliabilityDisputeHistoryViewedPayload,
} from "@dowhat/shared";
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, Image as RNImage, SafeAreaView, StatusBar, TouchableOpacity, ScrollView, Modal, TextInput } from "react-native";
import { Ionicons } from '@expo/vector-icons';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from "../../lib/supabase";
import { startGoogleSignIn } from "../../lib/auth";
import { fetchAttendanceSummary, joinSessionAttendance, type AttendanceStatus } from "../../lib/sessionAttendance";
import { useSavedActivities } from "../../../contexts/SavedActivitiesContext";
import { submitAttendanceDispute, fetchAttendanceDisputes, type AttendanceDisputeHistoryItem } from "../../../lib/attendanceDispute";

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

const MAX_DISPUTE_DETAILS = 1000;

const DISPUTE_STATUS_META: Record<AttendanceDisputeHistoryItem['status'], { label: string; backgroundColor: string; textColor: string }> = {
	open: { label: 'Open', backgroundColor: '#fff7ed', textColor: '#9a3412' },
	reviewing: { label: 'Reviewing', backgroundColor: '#e0f2fe', textColor: '#075985' },
	resolved: { label: 'Resolved', backgroundColor: '#ecfdf5', textColor: '#065f46' },
	dismissed: { label: 'Dismissed', backgroundColor: '#f3f4f6', textColor: '#374151' },
};

function formatTimestamp(value?: string | null) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}

function getStatusMeta(status: AttendanceDisputeHistoryItem['status']) {
	return DISPUTE_STATUS_META[status] ?? DISPUTE_STATUS_META.open;
}

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
	const [disputeOpen, setDisputeOpen] = useState(false);
	const [disputeReason, setDisputeReason] = useState('');
	const [disputeDetails, setDisputeDetails] = useState('');
	const [disputeError, setDisputeError] = useState<string | null>(null);
	const [disputeSubmitting, setDisputeSubmitting] = useState(false);
	const [disputeSuccess, setDisputeSuccess] = useState(false);
	const [disputeHistory, setDisputeHistory] = useState<AttendanceDisputeHistoryItem[]>([]);
	const [disputeHistoryLoading, setDisputeHistoryLoading] = useState(false);
	const [disputeHistoryError, setDisputeHistoryError] = useState<string | null>(null);
	const [historyOpen, setHistoryOpen] = useState(false);
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

function openDisputeSheet() {
	if (row?.id) {
		trackReliabilityContestOpened({
			platform: "mobile",
			surface: "session-detail",
			sessionId: row.id,
		});
	}
	setDisputeReason('');
	setDisputeDetails('');
	setDisputeError(null);
	setDisputeSuccess(false);
	setDisputeOpen(true);
}

function closeDisputeSheet() {
	if (disputeSubmitting) return;
	setDisputeOpen(false);
}

function openHistorySheet() {
	trackReliabilityDisputeHistoryViewed({
		platform: "mobile",
		surface: "session-detail",
		disputes: disputeHistory.length,
		source: "sheet-open",
	});
	setHistoryOpen(true);
}

function closeHistorySheet() {
	setHistoryOpen(false);
}

async function handleSubmitDispute() {
	if (!row?.id) return;
	const trimmedReason = disputeReason.trim();
	if (trimmedReason.length < 3) {
		setDisputeError('Add a short reason (3+ characters).');
		return;
	}
	if (trimmedReason.length > 120) {
		setDisputeError('Keep the reason under 120 characters.');
		return;
	}
	const trimmedDetails = disputeDetails.trim();
	if (trimmedDetails.length > MAX_DISPUTE_DETAILS) {
		setDisputeError(`Details must be ${MAX_DISPUTE_DETAILS} characters or fewer.`);
		return;
	}
	try {
		setDisputeSubmitting(true);
		setDisputeError(null);
		await submitAttendanceDispute({
			sessionId: row.id,
			reason: trimmedReason,
			details: trimmedDetails ? trimmedDetails : null,
		});
		setDisputeSuccess(true);
		await refreshDisputeHistory("post-submit");
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to submit dispute right now.';
		setDisputeError(message);
	} finally {
		setDisputeSubmitting(false);
	}
}

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

const refreshDisputeHistory = useCallback(
	async (
		source: ReliabilityDisputeHistoryViewedPayload["source"] = "auto-load"
	) => {
		setDisputeHistoryLoading(true);
		setDisputeHistoryError(null);
		try {
			const history = await fetchAttendanceDisputes();
			if (!mountedRef.current) return;
			setDisputeHistory(history);
			trackReliabilityDisputeHistoryViewed({
				platform: "mobile",
				surface: "session-detail",
				disputes: history.length,
				source,
			});
		} catch (err) {
			if (!mountedRef.current) return;
			const message = err instanceof Error ? err.message : 'Unable to load dispute history.';
			setDisputeHistoryError(message);
			trackReliabilityDisputeHistoryFailed({
				platform: "mobile",
				surface: "session-detail",
				source,
				error: message,
			});
		} finally {
			if (!mountedRef.current) return;
			setDisputeHistoryLoading(false);
		}
	}, []);

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
	if (!userId) {
		setDisputeHistory([]);
		return;
	}
	refreshDisputeHistory("auto-load");
}, [refreshDisputeHistory, userId]);

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
	const sessionEndDate = row?.ends_at ? new Date(row.ends_at) : null;
	const sessionHasEnded = sessionEndDate ? sessionEndDate.getTime() <= Date.now() : false;
	const canContestReliability = Boolean(row?.id && status === "going" && sessionHasEnded);
	const activeSessionDispute = useMemo(() => {
		if (!row?.id) return null;
		return disputeHistory.find((entry) => entry.sessionId === row.id && entry.status !== 'dismissed') ?? null;
	}, [disputeHistory, row?.id]);
	const contestDisabled = Boolean(activeSessionDispute);
	const contestCtaLabel = contestDisabled ? 'Dispute on file' : 'Contest reliability';
	const hasDisputeHistory = disputeHistory.length > 0;

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
						{canContestReliability ? (
							<View style={{ marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#a7f3d0', backgroundColor: '#ecfdf5' }}>
								<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
									<View style={{ flex: 1 }}>
										<Text style={{ fontWeight: '600', color: '#065f46' }}>Reliability looks off?</Text>
										<Text style={{ marginTop: 4, color: '#065f46', fontSize: 13 }}>
											If you were there but got a no-show or late cancel mark, send a quick note so we can review it.
										</Text>
									</View>
									{hasDisputeHistory && (
										<Pressable
											onPress={openHistorySheet}
											style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, borderWidth: 1, borderColor: '#0f766e' }}
										>
											<Text style={{ color: '#0f766e', fontWeight: '600', fontSize: 12 }}>View history</Text>
										</Pressable>
									)}
								</View>
								{activeSessionDispute && (
									<View style={{ marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: '#fefce8', borderWidth: 1, borderColor: '#fde68a' }}>
										<Text style={{ fontWeight: '600', color: '#92400e' }}>Session dispute status</Text>
										<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
											{(() => {
												const meta = getStatusMeta(activeSessionDispute.status);
												return (
													<View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, backgroundColor: meta.backgroundColor }}>
														<Text style={{ color: meta.textColor, fontWeight: '600', fontSize: 12 }}>{meta.label}</Text>
													</View>
												);
											})()}
											<Text style={{ color: '#92400e', fontSize: 12 }}>
												Submitted {formatTimestamp(activeSessionDispute.createdAt) ?? 'recently'}
											</Text>
										</View>
										{activeSessionDispute.resolutionNotes && (
											<Text style={{ marginTop: 4, color: '#b45309', fontSize: 12 }}>
												{activeSessionDispute.resolutionNotes}
											</Text>
										)}
									</View>
								)}
								<Pressable
									style={{
										marginTop: 10,
										alignSelf: 'flex-start',
										paddingHorizontal: 18,
										paddingVertical: 10,
										borderRadius: 9999,
										backgroundColor: contestDisabled ? 'rgba(6,95,70,0.25)' : '#0d9488',
										opacity: contestDisabled ? 0.7 : 1,
									}}
									onPress={contestDisabled ? undefined : openDisputeSheet}
									disabled={contestDisabled}
								>
									<Text style={{ color: 'white', fontWeight: '600' }}>
										{contestCtaLabel}
									</Text>
								</Pressable>
								<Text style={{ marginTop: 6, color: '#047857', fontSize: 12 }}>
									We usually reply within a day.
								</Text>
							</View>
						) : (
							<View style={{ marginTop: 12 }}>
								<Text style={{ color: '#6b7280', fontSize: 12 }}>
									{status !== 'going'
										? 'Only confirmed attendees can contest reliability.'
										: 'You can file a dispute once this session ends.'}
								</Text>
								{hasDisputeHistory && (
									<Pressable
										onPress={openHistorySheet}
										style={{
											marginTop: 8,
											alignSelf: 'flex-start',
											paddingHorizontal: 14,
											paddingVertical: 8,
											borderRadius: 9999,
											borderWidth: 1,
											borderColor: '#0f766e',
										}}
									>
										<Text style={{ color: '#0f766e', fontWeight: '600', fontSize: 12 }}>View dispute history</Text>
									</Pressable>
								)}
							</View>
						)}
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
			<Modal visible={historyOpen} transparent animationType="fade" onRequestClose={closeHistorySheet}>
				<View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', padding: 16 }}>
					<View style={{ backgroundColor: '#ffffff', borderRadius: 24, padding: 20, maxHeight: '80%' }}>
						<Text style={{ fontSize: 18, fontWeight: '700', color: '#0f172a' }}>Dispute history</Text>
						<Text style={{ marginTop: 4, color: '#475569', fontSize: 13 }}>Track submissions tied to your reliability score.</Text>
						{disputeHistoryError && (
							<View style={{ marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' }}>
								<Text style={{ color: '#991b1b', fontSize: 13 }}>{disputeHistoryError}</Text>
							</View>
						)}
						{disputeHistoryLoading ? (
							<Text style={{ marginTop: 16, color: '#475569' }}>Loading…</Text>
						) : disputeHistory.length === 0 ? (
							<View style={{ marginTop: 16 }}>
								<Text style={{ color: '#94a3b8', fontSize: 13 }}>No disputes yet. Once you submit a report it will show up here.</Text>
							</View>
						) : (
							<ScrollView style={{ marginTop: 16 }}>
								{disputeHistory.map((entry) => {
									const statusMeta = getStatusMeta(entry.status);
									const sessionRange = entry.session?.startsAt && entry.session?.endsAt
										? formatDateRange(entry.session.startsAt, entry.session.endsAt)
										: null;
									return (
										<View key={entry.id} style={{ marginBottom: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' }}>
											<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
												<View style={{ flex: 1 }}>
													<Text style={{ fontWeight: '600', color: '#0f172a' }}>{entry.session?.title ?? 'Session'}</Text>
													{sessionRange && <Text style={{ color: '#475569', fontSize: 12 }}>{sessionRange}</Text>}
													{entry.session?.venue && (
														<Text style={{ color: '#94a3b8', fontSize: 12 }}>{entry.session.venue}</Text>
													)}
												</View>
												<View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, backgroundColor: statusMeta.backgroundColor }}>
													<Text style={{ color: statusMeta.textColor, fontWeight: '600', fontSize: 12 }}>{statusMeta.label}</Text>
												</View>
											</View>
											<Text style={{ marginTop: 8, color: '#475569', fontSize: 12 }}>
												Submitted {formatTimestamp(entry.createdAt) ?? '—'}
											</Text>
											<Text style={{ marginTop: 8, color: '#0f172a', fontWeight: '600' }}>{entry.reason}</Text>
											{entry.details && (
												<Text style={{ marginTop: 4, color: '#1f2937', fontSize: 13 }}>{entry.details}</Text>
											)}
											{entry.resolutionNotes && (
												<Text style={{ marginTop: 8, color: '#0369a1', fontSize: 12 }}>Resolution: {entry.resolutionNotes}</Text>
											)}
											{entry.resolvedAt && (
												<Text style={{ marginTop: 4, color: '#0f172a', fontSize: 12 }}>
													Resolved {formatTimestamp(entry.resolvedAt) ?? '—'}
												</Text>
											)}
										</View>
									);
								})}
							</ScrollView>
						)}
						<View style={{ marginTop: 18, flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
							<Pressable
								onPress={() => refreshDisputeHistory("manual-refresh")}
								disabled={disputeHistoryLoading}
								style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999, borderWidth: 1, borderColor: '#cbd5f5', opacity: disputeHistoryLoading ? 0.6 : 1 }}
							>
								<Text style={{ color: '#475569', fontWeight: '600' }}>{disputeHistoryLoading ? 'Refreshing…' : 'Refresh'}</Text>
							</Pressable>
							<Pressable
								onPress={closeHistorySheet}
								style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999, backgroundColor: '#0d9488' }}
							>
								<Text style={{ color: '#ffffff', fontWeight: '700' }}>Close</Text>
							</Pressable>
						</View>
					</View>
				</View>
			</Modal>
			<Modal visible={disputeOpen} transparent animationType="slide" onRequestClose={closeDisputeSheet}>
				<View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', padding: 16 }}>
					<View style={{ backgroundColor: '#ffffff', borderRadius: 24, padding: 20 }}>
						<Text style={{ fontSize: 18, fontWeight: '700', color: '#0f172a' }}>Contest reliability</Text>
						<Text style={{ marginTop: 6, color: '#475569' }}>Let us know what happened so we can adjust your score if needed.</Text>
						{row && (
							<View style={{ marginTop: 12 }}>
								<Text style={{ fontWeight: '600', color: '#0f172a' }}>{row.activities?.name ?? 'Session'}</Text>
								<Text style={{ color: '#64748b', fontSize: 13 }}>{row.venues?.name ?? 'Venue TBD'}</Text>
								{sessionEndDate && (
									<Text style={{ color: '#94a3b8', fontSize: 12 }}>Ended {formatDateRange(row.starts_at, row.ends_at)}</Text>
								)}
							</View>
						)}
						{disputeError && (
							<View style={{ marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' }}>
								<Text style={{ color: '#b91c1c', fontSize: 13 }}>{disputeError}</Text>
							</View>
						)}
						{disputeSuccess && (
							<View style={{ marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#bbf7d0' }}>
								<Text style={{ color: '#047857', fontSize: 13 }}>Thanks! We received your report.</Text>
							</View>
						)}
						<Text style={{ marginTop: 16, fontWeight: '600', color: '#0f172a' }}>Reason</Text>
						<TextInput
							value={disputeReason}
							onChangeText={(text) => setDisputeReason(text)}
							placeholder="Host marked me absent"
							maxLength={120}
							editable={!disputeSuccess}
							style={{
								marginTop: 6,
								borderWidth: 1,
								borderColor: '#e2e8f0',
								borderRadius: 12,
								paddingHorizontal: 12,
								paddingVertical: 10,
							}}
						/>
						<Text style={{ marginTop: 14, fontWeight: '600', color: '#0f172a' }}>Details (optional)</Text>
						<TextInput
							value={disputeDetails}
							onChangeText={(text) => setDisputeDetails(text)}
							placeholder="Checked in with host, sent photo in chat…"
							maxLength={MAX_DISPUTE_DETAILS}
							multiline
							numberOfLines={4}
							editable={!disputeSuccess}
							style={{
								marginTop: 6,
								borderWidth: 1,
								borderColor: '#e2e8f0',
								borderRadius: 12,
								paddingHorizontal: 12,
								paddingVertical: 10,
								textAlignVertical: 'top',
							}}
						/>
						<Text style={{ marginTop: 6, color: '#94a3b8', fontSize: 12 }}>
							We’ll share this note with the trust & safety team only.
						</Text>
						<View style={{ marginTop: 18, flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
							<Pressable
								onPress={closeDisputeSheet}
								disabled={disputeSubmitting}
								style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999, borderWidth: 1, borderColor: '#cbd5f5' }}
							>
								<Text style={{ color: '#475569', fontWeight: '600' }}>Cancel</Text>
							</Pressable>
							<Pressable
								onPress={disputeSuccess ? closeDisputeSheet : handleSubmitDispute}
								disabled={disputeSubmitting && !disputeSuccess}
								style={{
									paddingHorizontal: 18,
									paddingVertical: 10,
									borderRadius: 9999,
									backgroundColor: disputeSuccess ? '#10b981' : '#0d9488',
									opacity: disputeSubmitting && !disputeSuccess ? 0.6 : 1,
								}}
							>
								<Text style={{ color: '#ffffff', fontWeight: '700' }}>
									{disputeSuccess ? 'Close' : disputeSubmitting ? 'Submitting…' : 'Submit report'}
								</Text>
							</Pressable>
						</View>
					</View>
				</View>
			</Modal>
		</SafeAreaView>
	);
}
