import { formatDateRange, formatPrice } from '@dowhat/shared';
import { useLocalSearchParams, Link, router } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import { View, Text, Pressable, FlatList, SafeAreaView, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LinearGradient } = require('expo-linear-gradient');
// Map activity names/ids to icons and colors (should match home.tsx)
const activityVisuals: Record<string, { icon: string; color: string }> = {
	'Rock Climbing': { icon: '🧗', color: '#fbbf24' },
	'Running': { icon: '🏃', color: '#f59e42' },
	'Yoga': { icon: '🧘', color: '#a3e635' },
	'Cycling': { icon: '🚴', color: '#38bdf8' },
	'Swimming': { icon: '🏊', color: '#60a5fa' },
	'Hiking': { icon: '🥾', color: '#f87171' },
	'Soccer': { icon: '⚽', color: '#fbbf24' },
	'Basketball': { icon: '🏀', color: '#f59e42' },
};

import { supabase } from '../../lib/supabase';


type Row = {
	session_id: string;
	starts_at: string;
	ends_at: string;
	price_cents: number | null;
	activity_id: string;
	activity_name: string;
	venue_id: string;
	venue_name: string;
	venue_address: string | null;
	venue_lat: number | null;
	venue_lng: number | null;
	distance_km: number | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const toNumber = (value: unknown): number | null => {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

const toRow = (value: unknown): Row | null => {
	if (!isRecord(value)) return null;
	const startsAt = typeof value.starts_at === 'string' ? value.starts_at : null;
	const endsAt = typeof value.ends_at === 'string' ? value.ends_at : null;
	const priceCents = toNumber(value.price_cents);
	const sessionId = typeof value.id === 'string' ? value.id : value.id != null ? String(value.id) : null;
	const activityRel = isRecord(value.activities) ? value.activities : null;
	const activityId = typeof value.activity_id === 'string'
		? value.activity_id
		: activityRel && typeof activityRel.id === 'string'
			? activityRel.id
			: value.activity_id != null
				? String(value.activity_id)
				: null;
	const activityName = activityRel && typeof activityRel.name === 'string' ? activityRel.name : '';
	const venueRel = isRecord(value.venues) ? value.venues : null;
	const venueId = venueRel && typeof venueRel.id === 'string'
		? venueRel.id
		: venueRel && venueRel.id != null
			? String(venueRel.id)
			: null;
	const venueName = venueRel && typeof venueRel.name === 'string' ? venueRel.name : '';
	const venueAddress = venueRel && typeof venueRel.address === 'string' ? venueRel.address : null;
	const venueLat = venueRel ? toNumber(venueRel.lat) : null;
	const venueLng = venueRel ? toNumber(venueRel.lng) : null;
	if (!sessionId || !activityId || !venueId || !startsAt || !endsAt) {
		return null;
	}
	return {
		session_id: sessionId,
		starts_at: startsAt,
		ends_at: endsAt,
		price_cents: priceCents,
		activity_id: activityId,
		activity_name: activityName || activityId,
		venue_id: venueId,
		venue_name: venueName || venueId,
		venue_address: venueAddress,
		venue_lat: venueLat,
		venue_lng: venueLng,
		distance_km: null,
	};
};

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const describePrice = (value: number | null): string => {
	if (typeof value === 'number' && Number.isFinite(value)) {
		if (value <= 0) return 'Free';
		return formatPrice(value);
	}
	return 'Free';
};

export default function ActivityPage() {
	const params = useLocalSearchParams<{ id?: string; name?: string; venue?: string; lat?: string; lng?: string }>();
	const id = typeof params.id === 'string' ? params.id : '';
	const initialActivityName = typeof params.name === 'string' && params.name.trim() ? params.name.trim() : null;
	const initialVenue = typeof params.venue === 'string' && params.venue.trim() ? params.venue.trim() : null;
	const fallbackLat = typeof params.lat === 'string' ? Number(params.lat) : null;
	const fallbackLng = typeof params.lng === 'string' ? Number(params.lng) : null;
	const [rows, setRows] = useState<Row[] | null>(null);
	const [err, setErr] = useState<string | null>(null);
	const [resolvedActivityId, setResolvedActivityId] = useState<string | null>(isUuid(id) ? id : null);
	const [resolvedActivityNameState, setResolvedActivityNameState] = useState<string | null>(initialActivityName);

	useEffect(() => {
		let cancelled = false;
		const run = async () => {
			if (!id && !initialActivityName) {
				setErr('Missing activity identifier.');
				setRows([]);
				return;
			}
			setErr(null);
			setRows(null);

			const nowIso = new Date().toISOString();

			const chooseBestActivity = (
				candidates: { id: string; name?: string | null; venue?: string | null; lat?: number | null; lng?: number | null }[]
			) => {
				if (!candidates.length) return null;
				const normalisedVenue = initialVenue?.trim().toLowerCase() ?? '';
				const hasCoordinates = typeof fallbackLat === 'number' && Number.isFinite(fallbackLat) && typeof fallbackLng === 'number' && Number.isFinite(fallbackLng);
				if (normalisedVenue) {
					const venueMatch = candidates.find((candidate) => candidate.venue?.trim().toLowerCase() === normalisedVenue);
					if (venueMatch) return venueMatch;
				}
				if (hasCoordinates) {
					const bestByDistance = candidates
						.map((candidate) => {
							if (candidate.lat == null || candidate.lng == null) return { candidate, distance: Number.POSITIVE_INFINITY };
							const distance = Math.hypot((candidate.lat ?? 0) - (fallbackLat ?? 0), (candidate.lng ?? 0) - (fallbackLng ?? 0));
							return { candidate, distance };
						})
						.sort((a, b) => a.distance - b.distance)[0]?.candidate;
					if (bestByDistance) return bestByDistance;
				}
				return candidates[0];
			};

			let targetId: string | null = isUuid(id) ? id : null;
			let resolvedName = initialActivityName ?? null;

			if (!targetId && initialActivityName) {
				const { data: activityMatches, error: activityError } = await supabase
					.from('activities')
					.select('id, name, venue, lat, lng')
					.ilike('name', initialActivityName)
					.limit(10);
				if (activityError) {
					setErr(activityError.message);
					setRows([]);
					return;
				}
				const chosen = chooseBestActivity(activityMatches ?? []);
				if (chosen?.id) {
					targetId = chosen.id;
					resolvedName = chosen.name ?? resolvedName;
				}
			}

			if (!targetId && initialActivityName) {
				const { data: sessionMatches, error: sessionMatchError } = await supabase
					.from('sessions')
					.select('activity_id, activities!inner(name)')
					.ilike('activities.name', initialActivityName)
					.limit(5);
				if (!sessionMatchError) {
					const candidate = sessionMatches?.find((row) => typeof row.activity_id === 'string');
					if (candidate?.activity_id) {
						targetId = candidate.activity_id;
						resolvedName = (candidate as { activities?: { name?: string | null } }).activities?.name ?? resolvedName;
					}
				}
			}

			if (!targetId) {
				setRows([]);
				return;
			}

			setResolvedActivityId(targetId);
			if (resolvedName) setResolvedActivityNameState(resolvedName);

			const { data, error } = await supabase
				.from('sessions')
				.select('id, activity_id, price_cents, starts_at, ends_at, activities(id,name), venues(id,name,address,lat:lat,lng:lng)')
				.eq('activity_id', targetId)
				.gte('starts_at', nowIso)
				.order('starts_at', { ascending: true })
				.limit(50);
			if (cancelled) return;
			if (error) {
				setErr(error.message);
				setRows([]);
				return;
			}
			const parsed = Array.isArray(data)
				? data.map(toRow).filter((row): row is Row => Boolean(row))
				: [];
			setRows(parsed);
		};
		run();
		return () => {
			cancelled = true;
		};
	}, [id, initialActivityName, initialVenue, fallbackLat, fallbackLng]);

	const venues = useMemo(() => {
		if (!rows) return [];
		const grouped: Record<string, { venue: { id: string; name: string; address: string | null; lat: number | null; lng: number | null }; items: Row[] }> = {};
		for (const r of rows) {
			const key = r.venue_id;
			if (!grouped[key]) {
				grouped[key] = {
					venue: { id: r.venue_id, name: r.venue_name, address: r.venue_address, lat: r.venue_lat, lng: r.venue_lng },
					items: [],
				};
			}
			grouped[key].items.push(r);
		}
		return Object.values(grouped);
	}, [rows]);

	const hasLoaded = rows !== null;
	const hasData = (rows?.length ?? 0) > 0;
	const isExternal = id ? !isUuid(id) : false;
	const resolvedActivityName =
		rows?.[0]?.activity_name || resolvedActivityNameState || initialActivityName || '';
	const activityName = resolvedActivityName || 'Activity';
	const addEventParams: Record<string, string> = {};
	if (resolvedActivityId) addEventParams.activityId = resolvedActivityId;
	else if (id) addEventParams.activityId = id;
	if (resolvedActivityName) addEventParams.activityName = resolvedActivityName;
	if (initialVenue) addEventParams.venue = initialVenue;
	if (fallbackLat != null && Number.isFinite(fallbackLat)) addEventParams.lat = String(fallbackLat);
	if (fallbackLng != null && Number.isFinite(fallbackLng)) addEventParams.lng = String(fallbackLng);
	const visual = activityVisuals[activityName] || { icon: '🎯', color: '#fbbf24' };
	const totalSessions = rows?.length ?? 0;
	const totalVenues = venues.length;
	const nextSession = rows?.[0] ?? null;
	const nextSessionRange = nextSession ? formatDateRange(nextSession.starts_at, nextSession.ends_at) : null;
	const nextSessionPrice = nextSession ? describePrice(nextSession.price_cents) : null;
	const nextSessionVenue = nextSession?.venue_name?.trim() ? nextSession.venue_name.trim() : null;
	const nextSessionAddress = nextSession?.venue_address?.trim() ? nextSession.venue_address.trim() : null;

	const headerComponent = (
		<View style={{ marginBottom: 20 }}>
			<LinearGradient
				colors={['#0f172a', '#2563EB']}
				start={{ x: 0, y: 0 }}
				end={{ x: 1, y: 1 }}
				style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 28, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
			>
				<View style={{ alignItems: 'center' }}>
					<View style={{ alignItems: 'center' }}>
						<Text style={{ color: '#BFDBFE', fontSize: 13, fontWeight: '600', letterSpacing: 0.4 }}>Activity details</Text>
						<Text style={{ fontSize: 26, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' }}>{activityName}</Text>
						<Text style={{ color: '#DBEAFE', textAlign: 'center', opacity: 0.9 }}>
							Discover venues hosting this activity and jump into an upcoming session.
						</Text>
					</View>
					<View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: visual.color, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, elevation: 5 }}>
						<Text style={{ fontSize: 50 }}>{visual.icon}</Text>
					</View>
					<View style={{ flexDirection: 'row', marginTop: 16 }}>
						<View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 }}>
							<Ionicons name="calendar-outline" size={15} color="#FFFFFF" />
							<Text style={{ color: '#FFFFFF', fontWeight: '600', marginLeft: 6 }}>{totalSessions} upcoming</Text>
						</View>
						<View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 }}>
							<Ionicons name="location-outline" size={15} color="#FFFFFF" />
							<Text style={{ color: '#FFFFFF', fontWeight: '600', marginLeft: 6 }}>{totalVenues} venues</Text>
						</View>
					</View>
				</View>
			</LinearGradient>
			<View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
				<Text style={{ fontSize: 20, fontWeight: '700', color: '#0F172A' }}>Places for {activityName}</Text>
				<Text style={{ color: '#475569', marginTop: 6 }}>
					Tap a session to explore the details or RSVP quickly.
				</Text>
				{nextSession && (
					<View style={{ marginTop: 16, backgroundColor: '#eef2ff', borderRadius: 18, padding: 16 }}>
						<Text style={{ fontSize: 13, fontWeight: '700', color: '#4338ca', textTransform: 'uppercase' }}>Next session</Text>
						<View style={{ marginTop: 8 }}>
							{nextSessionVenue && (
								<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
									<Ionicons name="location-outline" size={16} color="#4338ca" />
									<Text style={{ marginLeft: 8, color: '#312e81', fontWeight: '600', flexShrink: 1 }}>
										{nextSessionVenue}
									</Text>
								</View>
							)}
							{nextSessionAddress && (
								<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
									<Ionicons name="map-outline" size={16} color="#4338ca" />
									<Text style={{ marginLeft: 8, color: '#4338ca', flexShrink: 1 }}>{nextSessionAddress}</Text>
								</View>
							)}
							{nextSessionRange && (
								<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
									<Ionicons name="time-outline" size={16} color="#4338ca" />
									<Text style={{ marginLeft: 8, color: '#1e293b' }}>{nextSessionRange}</Text>
								</View>
							)}
							{nextSessionPrice && (
								<View style={{ flexDirection: 'row', alignItems: 'center' }}>
									<Ionicons name="pricetag-outline" size={16} color="#4338ca" />
									<Text style={{ marginLeft: 8, color: '#1e293b', fontWeight: '600' }}>{nextSessionPrice}</Text>
								</View>
							)}
						</View>
					</View>
				)}
				{initialVenue && (
					<View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
						<Ionicons name="location-outline" size={14} color="#475569" />
						<Text style={{ color: '#475569', marginLeft: 6 }}>{initialVenue}</Text>
					</View>
				)}
				<Link
					href={{ pathname: '/add-event', params: addEventParams }}
					asChild
				>
					<Pressable style={{ marginTop: 18, alignSelf: 'flex-start', backgroundColor: '#FBBF24', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999 }}>
						<Text style={{ fontWeight: '700', color: '#1F2937' }}>+ Create new event</Text>
					</Pressable>
				</Link>
			</View>
		</View>
	);

	if (err) {
		return (
			<SafeAreaView style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
				<Text style={{ color: '#b91c1c', fontSize: 16, textAlign: 'center', marginBottom: 16 }}>{err}</Text>
				<TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: '#2563EB' }}>
					<Text style={{ color: '#fff', fontWeight: '600' }}>Go back</Text>
				</TouchableOpacity>
			</SafeAreaView>
		);
	}

	if (!hasLoaded) {
		return (
			<SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center' }}>
				<Text style={{ color: '#475569', fontSize: 16 }}>Loading…</Text>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
			<FlatList
				data={hasData ? venues : []}
				contentContainerStyle={{ paddingBottom: 28 }}
				keyExtractor={(v) => v.venue.id}
				ListHeaderComponent={headerComponent}
				ListEmptyComponent={
					hasLoaded ? (
					<View style={{ paddingHorizontal: 20, paddingVertical: 40, alignItems: 'center' }}>
						<Ionicons name="calendar-clear-outline" size={32} color="#94A3B8" />
						<Text style={{ fontSize: 16, fontWeight: '600', color: '#334155', textAlign: 'center', marginTop: 12 }}>
							{isExternal ? 'No hosted sessions yet. Start one at this spot!' : 'No upcoming sessions just yet.'}
						</Text>
						<Text style={{ textAlign: 'center', color: '#64748B', marginTop: 6 }}>
							Create an event to bring people together.
						</Text>
						{fallbackLat != null && fallbackLng != null && Number.isFinite(fallbackLat) && Number.isFinite(fallbackLng) && (
							<TouchableOpacity
								onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${fallbackLat},${fallbackLng}`)}
								style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(37,99,235,0.1)', marginTop: 12 }}
							>
								<Ionicons name="navigate-outline" size={16} color="#2563eb" />
								<Text style={{ color: '#2563eb', fontWeight: '600', marginLeft: 6 }}>View location in Maps</Text>
							</TouchableOpacity>
						)}
						<Link href={{ pathname: '/add-event', params: addEventParams }} asChild>
							<Pressable style={{ backgroundColor: '#2563eb', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 }}>
								<Text style={{ color: 'white', fontWeight: '600' }}>Create an event</Text>
							</Pressable>
						</Link>
						</View>
					) : (
						<View style={{ paddingHorizontal: 20, paddingVertical: 40, alignItems: 'center' }}>
							<Text style={{ color: '#475569' }}>Loading sessions…</Text>
						</View>
					)
				}
				renderItem={({ item }) => (
					<View style={{ marginHorizontal: 20, marginBottom: 18, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 }}>
						<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
							<Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A', flexShrink: 1 }}>{item.venue.name}</Text>
							<Text style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, fontSize: 12, fontWeight: '600' }}>
								{item.items.length} session{item.items.length === 1 ? '' : 's'}
							</Text>
						</View>
						{item.venue.address && (
							<View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
								<Ionicons name="location-outline" size={16} color="#475569" />
								<Text style={{ marginLeft: 8, color: '#475569', flexShrink: 1 }}>{item.venue.address}</Text>
							</View>
						)}
						{item.venue.lat != null && item.venue.lng != null && (
							<View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
								<TouchableOpacity
									onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${item.venue.lat},${item.venue.lng}`)}
									style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(15,118,110,0.08)' }}
									activeOpacity={0.75}
								>
									<Ionicons name="navigate-outline" size={16} color="#0F766E" />
									<Text style={{ color: '#0F766E', fontWeight: '600', marginLeft: 6 }}>Open in Maps</Text>
								</TouchableOpacity>
							</View>
						)}
						{item.items.map((s) => {
							const sessionRange = formatDateRange(s.starts_at, s.ends_at);
							const sessionPrice = describePrice(s.price_cents);
							return (
								<View key={s.session_id} style={{ marginTop: 16, borderRadius: 14, backgroundColor: '#F8FAFC', padding: 14 }}>
									<View style={{ flexDirection: 'row', alignItems: 'center' }}>
										<Ionicons name="time-outline" size={16} color="#0F172A" />
										<Text style={{ marginLeft: 8, fontWeight: '700', color: '#0F172A', flexShrink: 1 }}>{sessionRange}</Text>
									</View>
									<View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
										<Ionicons name="pricetag-outline" size={16} color="#0F172A" />
										<Text style={{ marginLeft: 8, color: '#475569', fontWeight: '600' }}>{sessionPrice}</Text>
									</View>
									<Link href={`/sessions/${s.session_id}`} asChild>
										<Pressable style={{ marginTop: 12, backgroundColor: '#16A34A', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 }}>
											<Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '600' }}>View details</Text>
										</Pressable>
									</Link>
								</View>
							);
						})}
					</View>
				)}
			/>
		</SafeAreaView>
	);
}
