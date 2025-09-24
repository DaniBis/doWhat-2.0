import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';

type SavedActivity = {
	id: string;
	name: string;
	cover_url?: string | null;
	sessions_count?: number;
};

export default function Saved() {
	const [loading, setLoading] = useState(true);
	const [items, setItems] = useState<SavedActivity[]>([]);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		(async () => {
			try {
				setLoading(true); setError(null);
				const { data: userResp } = await supabase.auth.getUser();
				const uid = userResp?.user?.id;
				if (!uid) { setItems([]); setLoading(false); return; }
				const { data, error } = await supabase
					.from('saved_activities_view')
					.select('id,name,cover_url,sessions_count')
					.eq('user_id', uid)
					.order('updated_at', { ascending: false });
				if (error) throw error;
				setItems((data ?? []) as any);
			} catch (e: any) {
				setError(e.message ?? 'Failed to load saved items');
			} finally { setLoading(false); }
		})();
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
					{items.map((a) => (
						<Link key={a.id} href={`/activities/${a.id}`} asChild>
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
								<Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 4 }}>{a.name}</Text>
								{!!a.sessions_count && (
									<Text style={{ color: '#6b7280' }}>{a.sessions_count} upcoming session{a.sessions_count === 1 ? '' : 's'}</Text>
								)}
							</Pressable>
						</Link>
					))}
				</View>
			)}
		</ScrollView>
	);
}

