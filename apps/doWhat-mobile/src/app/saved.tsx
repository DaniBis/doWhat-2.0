import { useCallback } from 'react';
import { Link } from 'expo-router';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSavedActivities } from '../contexts/SavedActivitiesContext';

export default function Saved() {
	const { items, loading, error, refresh, refreshing, pendingIds, unsave } = useSavedActivities();

	const handleRefresh = useCallback(() => {
		void refresh();
	}, [refresh]);

	const handleUnsave = useCallback(async (placeId: string) => {
		if (!placeId || pendingIds.has(placeId)) return;
		try {
			await unsave(placeId);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to update saved activities.';
			Alert.alert('Remove saved activity', message);
		}
	}, [pendingIds, unsave]);

	if (loading) {
		return (
			<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
				<ActivityIndicator />
			</View>
		);
	}

	return (
		<ScrollView
			contentContainerStyle={{ padding: 16 }}
			refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
		>
			<Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 12 }}>Saved</Text>
			<Text style={{ color: '#6b7280', marginBottom: 16 }}>Your saved activities live here.</Text>

			{error && (
				<View style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 16 }}>
					<Text style={{ color: '#b91c1c' }}>{error}</Text>
				</View>
			)}

			{items.length === 0 ? (
				<View style={{ padding: 24, alignItems: 'center' }}>
					<Text style={{ color: '#6b7280', marginBottom: 12 }}>You haven't saved anything yet.</Text>
					<Link href="/" asChild>
						<Pressable style={{ backgroundColor: '#0d9488', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}>
							<Text style={{ color: 'white', fontWeight: '600' }}>Browse activities</Text>
						</Pressable>
					</Link>
				</View>
			) : (
				<View style={{ gap: 12 }}>
					{items.map((activity) => {
						const name = activity.name ?? 'Saved activity';
						const pending = pendingIds.has(activity.placeId);
						return (
							<Link
								key={activity.placeId}
								href={{ pathname: '/activities/[id]', params: { id: activity.placeId, name } }}
								asChild
							>
								<Pressable
									style={{
										backgroundColor: 'white',
										borderRadius: 12,
										padding: 14,
										borderWidth: 1,
										borderColor: '#e5e7eb',
										shadowColor: '#000',
										shadowOpacity: 0.05,
										shadowRadius: 6,
									}}
								>
									<Pressable
										onPress={(event) => {
											event.stopPropagation?.();
											event.preventDefault?.();
											handleUnsave(activity.placeId);
										}}
										disabled={pending}
										style={{
											position: 'absolute',
											top: 12,
											right: 12,
											borderRadius: 999,
											borderWidth: 1,
											borderColor: 'rgba(4,120,87,0.3)',
											backgroundColor: 'rgba(5,150,105,0.12)',
											paddingHorizontal: 10,
											paddingVertical: 4,
											flexDirection: 'row',
											alignItems: 'center',
											gap: 6,
											opacity: pending ? 0.6 : 1,
										}}
									>
										{pending ? (
											<ActivityIndicator size="small" color="#047857" />
										) : (
											<>
												<Ionicons name="bookmark" size={14} color="#047857" />
												<Text style={{ color: '#047857', fontWeight: '600', fontSize: 12 }}>Saved</Text>
											</>
										)}
									</Pressable>
									<Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 4 }}>{name}</Text>
									{activity.sessionsCount > 0 && (
										<Text style={{ color: '#6b7280' }}>
											{activity.sessionsCount} upcoming session{activity.sessionsCount === 1 ? '' : 's'}
										</Text>
									)}
									{activity.address && (
										<Text style={{ color: '#94a3b8', marginTop: 4 }}>{activity.address}</Text>
									)}
								</Pressable>
							</Link>
						);
					})}
				</View>
			)}
		</ScrollView>
	);
}
