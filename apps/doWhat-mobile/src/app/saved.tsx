import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';

type SavedActivity = {
	id: string;
	name: string;
	cover_url: string | null;
	sessions_count: number | null;
	updated_at?: string | null;
};

export default function Saved() {
	const [loading, setLoading] = useState(true);
	const [items, setItems] = useState<SavedActivity[]>([]);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				setLoading(true); setError(null);
				const { data: userResp } = await supabase.auth.getUser();
				const uid = userResp?.user?.id;
				if (!uid) {
					if (!cancelled) {
						setItems([]);
						setLoading(false);
					}
					return;
				}
				const sources: Array<{ table: string; includeUpdatedAt: boolean }> = [
					{ table: 'saved_activities_view', includeUpdatedAt: true },
					{ table: 'saved_activities', includeUpdatedAt: true },
				];
				let loaded = false;
				let lastError: string | null = null;
				for (const source of sources) {
					let query = supabase
						.from(source.table)
						.select(source.includeUpdatedAt ? 'id,name,cover_url,sessions_count,updated_at' : 'id,name,cover_url,sessions_count')
						.eq('user_id', uid);
					if (source.includeUpdatedAt) {
						try {
							query = query.order('updated_at', { ascending: false });
						} catch {}
					}
					const { data, error } = await query.returns<SavedActivity[]>();
					if (!error) {
						if (!cancelled) {
							setItems(data ?? []);
							setError(null);
						}
						loaded = true;
						break;
					}
					lastError = error.message ?? 'Failed to load saved items';
					if (/could not find the table/i.test(lastError) || /schema cache/i.test(lastError)) {
						if (!cancelled) {
							setItems([]);
							setError(null);
						}
						loaded = true;
						break;
					}
					if (/updated_at/i.test(lastError)) {
						const retry = await supabase
							.from(source.table)
							.select('id,name,cover_url,sessions_count')
							.eq('user_id', uid)
							.returns<SavedActivity[]>();
						if (!retry.error) {
							if (!cancelled) {
								setItems(retry.data ?? []);
								setError(null);
							}
							loaded = true;
							break;
						}
						lastError = retry.error.message ?? lastError;
					}
				}
				if (!loaded && !cancelled) {
					setItems([]);
					setError(lastError ?? 'Failed to load saved items');
				}
			} catch (caught) {
				const message = caught instanceof Error ? caught.message : 'Failed to load saved items';
				if (!cancelled) setError(message);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	if (loading) {
		return (
			<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
				<ActivityIndicator />
			</View>
		);
	}

	return (
		<ScrollView contentContainerStyle={{ padding: 16 }}>
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
					{items.map((activity) => (
						<Link key={activity.id} href={`/activities/${activity.id}`} asChild>
							<Pressable style={{
								backgroundColor: 'white',
								borderRadius: 12,
								padding: 14,
								borderWidth: 1,
								borderColor: '#e5e7eb',
								shadowColor: '#000',
								shadowOpacity: 0.05,
								shadowRadius: 6,
							}}>
								<Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 4 }}>{activity.name}</Text>
								{activity.sessions_count != null && activity.sessions_count > 0 && (
									<Text style={{ color: '#6b7280' }}>{activity.sessions_count} upcoming session{activity.sessions_count === 1 ? '' : 's'}</Text>
								)}
							</Pressable>
						</Link>
					))}
				</View>
			)}
		</ScrollView>
	);
}
