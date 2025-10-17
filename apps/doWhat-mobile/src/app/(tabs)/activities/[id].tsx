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
		venue_lat: venueLat,
		venue_lng: venueLng,
		distance_km: null,
	};
};

export default function ActivityPage() {
	const params = useLocalSearchParams<{ id?: string; name?: string }>();
	const id = typeof params.id === 'string' ? params.id : '';
	const initialActivityName = typeof params.name === 'string' && params.name.trim() ? params.name.trim() : null;
	const [rows, setRows] = useState<Row[] | null>(null);
	const [err, setErr] = useState<string | null>(null);

	useEffect(() => {
		(async () => {
			if (!id) {
				setErr('Missing activity id.');
				return;
			}
			setErr(null);
			const nowIso = new Date().toISOString();
			const { data, error } = await supabase
				.from('sessions')
				.select('id, activity_id, price_cents, starts_at, ends_at, activities(id,name), venues(id,name,lat:lat,lng:lng)')
				.eq('activity_id', id)
				.gte('starts_at', nowIso)
				.order('starts_at', { ascending: true })
				.limit(50);
			if (error) { setErr(error.message); return; }
			const parsed = Array.isArray(data)
				? data.map(toRow).filter((row): row is Row => Boolean(row))
				: [];
			setRows(parsed);
		})();
	}, [id]);

	const venues = useMemo(() => {
		if (!rows) return [];
		const grouped: Record<string, { venue: { id: string; name: string; lat: number | null; lng: number | null }; items: Row[] }> = {};
		for (const r of rows) {
			const key = r.venue_id;
			if (!grouped[key]) {
				grouped[key] = {
					venue: { id: r.venue_id, name: r.venue_name, lat: r.venue_lat, lng: r.venue_lng },
					items: [],
				};
			}
			grouped[key].items.push(r);
		}
		return Object.values(grouped);
	}, [rows]);

	const hasLoaded = rows !== null;
	const hasData = (rows?.length ?? 0) > 0;
	const resolvedActivityName = rows?.[0]?.activity_name || initialActivityName || '';
	const activityName = resolvedActivityName || 'Activity';
	const addEventParams = resolvedActivityName ? { activityId: id, activityName: resolvedActivityName } : { activityId: id };
	const visual = activityVisuals[activityName] || { icon: '🎯', color: '#fbbf24' };
	const totalSessions = rows?.length ?? 0;
	const totalVenues = venues.length;

	const headerComponent = (
		<View style={{ marginBottom: 20 }}>
			<LinearGradient
				colors={['#0f172a', '#2563EB']}
				start={{ x: 0, y: 0 }}
				end={{ x: 1, y: 1 }}
				style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 28, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
			>
				<View style={{ alignItems: 'center', gap: 14 }}>
					<View style={{ alignItems: 'center', gap: 4 }}>
						<Text style={{ color: '#BFDBFE', fontSize: 13, fontWeight: '600', letterSpacing: 0.4 }}>Activity details</Text>
						<Text style={{ fontSize: 26, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' }}>{activityName}</Text>
						<Text style={{ color: '#DBEAFE', textAlign: 'center', opacity: 0.9 }}>
							Discover venues hosting this activity and jump into an upcoming session.
						</Text>
					</View>
					<View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: visual.color, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, elevation: 5 }}>
						<Text style={{ fontSize: 50 }}>{visual.icon}</Text>
					</View>
					<View style={{ flexDirection: 'row', gap: 12 }}>
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
					<View style={{ paddingHorizontal: 20, paddingVertical: 40, alignItems: 'center' }}>
						<Ionicons name="calendar-clear-outline" size={32} color="#94A3B8" />
						<Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: '#334155' }}>No upcoming sessions just yet.</Text>
						<Text style={{ marginTop: 4, textAlign: 'center', color: '#64748B' }}>
							Check back soon or create a new event to kick things off.
						</Text>
					</View>
				}
				renderItem={({ item }) => (
					<View style={{ marginHorizontal: 20, marginBottom: 18, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 }}>
						<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
							<Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A', flexShrink: 1 }}>{item.venue.name}</Text>
							<Text style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, fontSize: 12, fontWeight: '600' }}>
								{item.items.length} session{item.items.length === 1 ? '' : 's'}
							</Text>
						</View>
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
						{item.items.map((s) => (
							<View key={s.session_id} style={{ marginTop: 16, borderRadius: 14, backgroundColor: '#F8FAFC', padding: 14 }}>
								<Text style={{ fontWeight: '700', color: '#0F172A' }}>{formatDateRange(s.starts_at, s.ends_at)}</Text>
								{!!s.price_cents && <Text style={{ color: '#475569', marginTop: 4 }}>{formatPrice(s.price_cents)}</Text>}
								<Link href={`/sessions/${s.session_id}`} asChild>
									<Pressable style={{ marginTop: 12, backgroundColor: '#16A34A', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 }}>
										<Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '600' }}>View details</Text>
									</Pressable>
								</Link>
							</View>
						))}
					</View>
				)}
			/>
		</SafeAreaView>
	);
}
