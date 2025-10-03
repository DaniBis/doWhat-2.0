import { formatDateRange, formatPrice } from '@dowhat/shared';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, SafeAreaView, TouchableOpacity } from 'react-native';
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
	distance_km: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const toRow = (value: unknown): Row | null => {
	if (!isRecord(value)) return null;
	const sessionId = typeof value.session_id === 'string' ? value.session_id : null;
	const activityId = typeof value.activity_id === 'string' ? value.activity_id : null;
	const activityName = typeof value.activity_name === 'string' ? value.activity_name : '';
	const venueId = typeof value.venue_id === 'string' ? value.venue_id : null;
	const venueName = typeof value.venue_name === 'string' ? value.venue_name : '';
	const startsAt = typeof value.starts_at === 'string' ? value.starts_at : null;
	const endsAt = typeof value.ends_at === 'string' ? value.ends_at : null;
	const priceCents = typeof value.price_cents === 'number' ? value.price_cents : null;
	const venueLat = typeof value.venue_lat === 'number' ? value.venue_lat : null;
	const venueLng = typeof value.venue_lng === 'number' ? value.venue_lng : null;
	const distanceKm = typeof value.distance_km === 'number' ? value.distance_km : null;
	if (!sessionId || !activityId || !venueId || !startsAt || !endsAt || distanceKm == null) {
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
		distance_km: distanceKm,
	};
};

export default function ActivityPage() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const [rows, setRows] = useState<Row[] | null>(null);
	const [err, setErr] = useState<string | null>(null);

	useEffect(() => {
		(async () => {
			setErr(null);
			// Attempt to use nearby within 100km if we don't have cached coordinates
			const { data, error } = await supabase.rpc('sessions_nearby', {
				lat: null,
				lng: null,
				p_km: 100,
				activities: [id],
				day: null,
			});
			if (error) { setErr(error.message); return; }
			const parsed = Array.isArray(data)
				? data.map(toRow).filter((row): row is Row => Boolean(row))
				: [];
			setRows(parsed);
		})();
	}, [id]);

	if (err) return <Text style={{ padding: 16, color: 'red' }}>{err}</Text>;
	if (!rows) return <Text style={{ padding: 16 }}>Loading…</Text>;

	// Use first row for activity name/icon
	const activityName = rows[0]?.activity_name || 'Activity';
	const visual = activityVisuals[activityName] || { icon: '🎯', color: '#fbbf24' };

	const groups: Record<string, { venue: { id: string; name: string; lat: number | null; lng: number | null }, items: Row[] }> = {};
	for (const r of rows) {
		const key = r.venue_id;
		if (!groups[key]) groups[key] = { venue: { id: r.venue_id, name: r.venue_name, lat: r.venue_lat, lng: r.venue_lng }, items: [] };
		groups[key].items.push(r);
	}
	const venues = Object.values(groups);

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
			{/* Top bar */}
			<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, backgroundColor: '#2C3E50' }}>
				<TouchableOpacity onPress={() => router.back()}>
					<Text style={{ color: '#fff', fontSize: 22 }}>←</Text>
				</TouchableOpacity>
				<Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>Activity</Text>
				<View style={{ width: 32 }} />
			</View>
			{/* Activity icon and name */}
			<View style={{ alignItems: 'center', marginTop: 18, marginBottom: 8 }}>
				<View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: visual.color, alignItems: 'center', justifyContent: 'center', marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 }}>
					<Text style={{ fontSize: 38 }}>{visual.icon}</Text>
				</View>
				<Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 2 }}>{activityName}</Text>
			</View>
			{/* Venue cards */}
			<FlatList
				contentContainerStyle={{ padding: 12, gap: 16 }}
				data={venues}
				keyExtractor={(v) => v.venue.id}
				renderItem={({ item }) => (
					<View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 8, elevation: 3 }}>
						<Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 4 }}>{item.venue.name}</Text>
						{item.venue.lat != null && item.venue.lng != null && (
							<Pressable style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${item.venue.lat},${item.venue.lng}`)}>
								<Text style={{ fontSize: 16, marginRight: 4 }}>📍</Text>
								<Text style={{ color: '#0d9488', fontWeight: '600' }}>Open in Maps</Text>
							</Pressable>
						)}
						{item.items.map((s) => (
							<View key={s.session_id} style={{ marginTop: 10, backgroundColor: '#f9fafb', borderRadius: 10, padding: 10 }}>
								<Text style={{ fontWeight: '600' }}>{formatDateRange(s.starts_at, s.ends_at)}</Text>
								{!!s.price_cents && <Text style={{ color: '#64748b' }}>{formatPrice(s.price_cents)}</Text>}
								<Link href={`/sessions/${s.session_id}`} asChild>
									<Pressable style={{ marginTop: 8, backgroundColor: '#16a34a', borderRadius: 8, padding: 10 }}>
										<Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>View details</Text>
									</Pressable>
								</Link>
							</View>
						))}
					</View>
				)}
				ListHeaderComponent={
					<View style={{ margin: 8, alignItems: 'center' }}>
						<Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 6 }}>Places for activity</Text>
						<Link href={`/add-event`} asChild>
							<Pressable style={{ marginTop: 8, backgroundColor: '#fbbf24', borderRadius: 8, padding: 12, minWidth: 160 }}>
								<Text style={{ textAlign: 'center', fontWeight: '700', fontSize: 16 }}>+ Create new event</Text>
							</Pressable>
						</Link>
					</View>
				}
			/>
		</SafeAreaView>
	);
}
