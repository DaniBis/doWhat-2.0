import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
	View,
	Text,
	StyleSheet,
	SafeAreaView,
	TouchableOpacity,
	ScrollView,
	StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
	DEFAULT_PEOPLE_FILTER_PREFERENCES,
	countActivePeopleFilters,
	getTraitOnboardingState,
	loadUserPreference,
	normalisePeopleFilterPreferences,
	PEOPLE_FILTER_AGE_RANGES,
	PEOPLE_FILTER_GROUP_SIZES,
	PEOPLE_FILTER_SKILL_LEVELS,
	saveUserPreference,
	type PeopleFilterPreferences,
} from '@dowhat/shared';

import { supabase } from '../lib/supabase';
import { createWebUrl } from '../lib/web';

type UserTrait = {
	trait_name: string;
	icon: string;
	color: string;
	count: number;
};

type PopularTraitResponse = {
	id: string;
	name: string;
	color?: string | null;
	icon?: string | null;
	score: number;
	voteCount: number;
	baseCount: number;
	popularity: number;
};
const FALLBACK_TRAITS: ReadonlyArray<{ trait_name: string; icon: string; color: string }> = [
	{ trait_name: 'Early Bird', icon: '🌅', color: '#F59E0B' },
	{ trait_name: 'Night Owl', icon: '🦉', color: '#7C3AED' },
	{ trait_name: 'Social Butterfly', icon: '🦋', color: '#EC4899' },
	{ trait_name: 'Adventure Seeker', icon: '🏔️', color: '#059669' },
	{ trait_name: 'Fitness Enthusiast', icon: '💪', color: '#DC2626' },
	{ trait_name: 'Foodie', icon: '🍕', color: '#EA580C' },
	{ trait_name: 'Art Lover', icon: '🎨', color: '#9333EA' },
	{ trait_name: 'Music Fan', icon: '🎵', color: '#0EA5E9' },
	{ trait_name: 'Tech Geek', icon: '💻', color: '#059669' },
];

const TRAIT_ICON_EMOJI_MAP: Record<string, string> = {
	Sparkles: '✨',
	Megaphone: '📣',
	Users: '🤝',
	Lotus: '🪷',
	Compass: '🧭',
	Target: '🎯',
	Gamepad2: '🎮',
	ClipboardCheck: '✅',
	Smile: '😊',
	Shuffle: '🔀',
	ShieldCheck: '🛡️',
};

const resolveTraitEmoji = (icon?: string | null): string => {
	if (!icon) return '✨';
	const trimmed = icon.trim();
	return TRAIT_ICON_EMOJI_MAP[trimmed] ?? (trimmed.length === 1 ? trimmed : '✨');
};

const buildFallbackTraitCounts = (): UserTrait[] =>
	FALLBACK_TRAITS.map((trait, index) => ({
		trait_name: trait.trait_name,
		icon: trait.icon,
		color: trait.color,
		count: Math.floor(Math.random() * 40) + 10 + index * 2,
	}));

// Removed Activity Filters (categories/timeSlots) to keep this screen focused on People filters

const PEOPLE_LOCAL_KEY = 'people_filters:v1';

export default function PeopleFilterScreen() {
	const [peopleFilters, setPeopleFilters] = useState<PeopleFilterPreferences>(
		DEFAULT_PEOPLE_FILTER_PREFERENCES,
	);
	const [nearbyTraits, setNearbyTraits] = useState<UserTrait[]>([]);
	const [userId, setUserId] = useState<string | null>(null);
	const [initialised, setInitialised] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [baseTraitCount, setBaseTraitCount] = useState<number | null>(null);
	const [traitCountLoading, setTraitCountLoading] = useState(false);

	useEffect(() => {
		fetchNearbyTraits();
	}, []);

	useEffect(() => {
		let cancelled = false;

		const readLocal = async (): Promise<PeopleFilterPreferences | null> => {
			try {
				const raw = await AsyncStorage.getItem(PEOPLE_LOCAL_KEY);
				if (!raw) return null;
				return normalisePeopleFilterPreferences(JSON.parse(raw) as PeopleFilterPreferences);
			} catch (error) {
				console.warn('[people-filters] unable to parse cached filters', error);
				return null;
			}
		};

		const bootstrap = async () => {
			try {
				const { data } = await supabase.auth.getUser();
				if (cancelled) return;
				const user = data.user ?? null;
				setUserId(user?.id ?? null);

				if (user?.id) {
					try {
						const remote = await loadUserPreference<PeopleFilterPreferences>(
							supabase,
							user.id,
							'people_filters',
						);
						if (!cancelled && remote) {
							setPeopleFilters(normalisePeopleFilterPreferences(remote));
							return;
						}
					} catch (error) {
						console.warn('[people-filters] failed to load remote preferences', error);
					}
				}

				const local = await readLocal();
				if (!cancelled && local) {
					setPeopleFilters(local);
				}
			} finally {
				if (!cancelled) {
					setInitialised(true);
					setIsLoading(false);
				}
			}
		};

		bootstrap();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!userId) {
			setBaseTraitCount(null);
			return;
		}
		let cancelled = false;
		setTraitCountLoading(true);
		(async () => {
			try {
				const { count, error } = await supabase
					.from('user_base_traits')
					.select('trait_id', { count: 'exact', head: true })
					.eq('user_id', userId);
				if (error) throw error;
				if (!cancelled) {
					setBaseTraitCount(typeof count === 'number' ? count : 0);
				}
			} catch (error) {
				if (__DEV__) {
					console.warn('[people-filters] failed to load base trait count', error);
				}
				if (!cancelled) {
					setBaseTraitCount(0);
				}
			} finally {
				if (!cancelled) {
					setTraitCountLoading(false);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [userId]);

	const persistPreferences = useCallback(
		async (next: PeopleFilterPreferences) => {
			const normalised = normalisePeopleFilterPreferences(next);
			try {
				await AsyncStorage.setItem(PEOPLE_LOCAL_KEY, JSON.stringify(normalised));
			} catch (error) {
				console.warn('[people-filters] unable to cache filters locally', error);
			}
			if (userId) {
				try {
					await saveUserPreference(supabase, userId, 'people_filters', normalised);
				} catch (error) {
					console.warn('[people-filters] failed to persist remote preferences', error);
				}
			}
		},
		[userId],
	);

	useEffect(() => {
		if (!initialised) return;
		void persistPreferences(peopleFilters);
	}, [peopleFilters, initialised, persistPreferences]);

	const updatePeopleFilters = useCallback(
		(updater: (prev: PeopleFilterPreferences) => PeopleFilterPreferences) => {
			setPeopleFilters((prev) => normalisePeopleFilterPreferences(updater(prev)));
		},
		[],
	);

	const fetchNearbyTraits = async () => {
		try {
			const url = createWebUrl('/api/traits/popular?limit=9');
			const response = await fetch(url.toString(), { credentials: 'include' });
			if (!response.ok) {
				throw new Error(`Failed to load traits (${response.status})`);
			}
			const payload = (await response.json()) as PopularTraitResponse[];
			if (!Array.isArray(payload) || payload.length === 0) {
				setNearbyTraits(buildFallbackTraitCounts());
				return;
			}
			const mapped = payload.map((trait, index) => {
				const count = trait.popularity || trait.voteCount || trait.baseCount || trait.score || 1;
				return {
					trait_name: trait.name ?? `Trait ${index + 1}`,
					icon: resolveTraitEmoji(trait.icon),
					color:
						trait.color ?? FALLBACK_TRAITS[index % FALLBACK_TRAITS.length]?.color ?? '#0EA5E9',
					count: Math.max(1, Math.round(count)),
				};
			});
			setNearbyTraits(mapped.sort((a, b) => b.count - a.count));
		} catch (error) {
			console.error('[people-filters] failed to load popular traits', error);
			setNearbyTraits(buildFallbackTraitCounts());
		}
	};

	const toggleFilter = (
		category: 'personalityTraits' | 'skillLevels' | 'ageRanges' | 'groupSizePreference',
		value: string,
	) => {
		updatePeopleFilters((prev) => ({
			...prev,
			[category]: prev[category].includes(value)
				? prev[category].filter((item) => item !== value)
				: [...prev[category], value],
		}));
	};

	const clearAllFilters = () => {
		updatePeopleFilters(() => DEFAULT_PEOPLE_FILTER_PREFERENCES);
	};

	const applyFilters = () => {
		console.log('Applying filters:', peopleFilters);
		router.back();
	};

	const activeFiltersCount = useMemo(
		() => countActivePeopleFilters(peopleFilters),
		[peopleFilters],
	);

	// Removed Activity Filters UI

	const { needsTraitOnboarding, traitShortfall } = getTraitOnboardingState({ baseTraitCount, traitCountLoading });

	const renderPeopleFilters = () => (
		<ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
			{isLoading && (
				<Text style={styles.loadingText}>Loading your saved preferences…</Text>
			)}
			{needsTraitOnboarding && (
				<View style={styles.traitCtaCard}>
					<Text style={styles.traitCtaEyebrow}>Finish onboarding</Text>
					<Text style={styles.traitCtaTitle}>Lock in your vibe</Text>
					<Text style={styles.traitCtaBody}>
						Add {traitShortfall} more trait{traitShortfall === 1 ? '' : 's'} so we can personalise matches in this filter.
					</Text>
					<TouchableOpacity
						style={styles.traitCtaButton}
						onPress={() => router.push('/onboarding-traits')}
					>
						<Text style={styles.traitCtaButtonText}>Choose traits</Text>
					</TouchableOpacity>
				</View>
			)}
			{/* Popular Traits in Your Area */}
			<View style={styles.filterSection}>
				<Text style={styles.filterTitle}>Popular Personality Traits Nearby</Text>
				<Text style={styles.filterSubtitle}>Find people who share these traits</Text>
				<View style={styles.traitsGrid}>
					{nearbyTraits.map((trait) => (
						<TouchableOpacity
							key={trait.trait_name}
							style={[
								styles.traitCard,
								peopleFilters.personalityTraits.includes(trait.trait_name) && styles.traitCardActive,
							]}
							onPress={() => toggleFilter('personalityTraits', trait.trait_name)}
						>
							<Text style={styles.traitIcon}>{trait.icon}</Text>
							<Text
								style={[
									styles.traitName,
									peopleFilters.personalityTraits.includes(trait.trait_name) && styles.traitNameActive,
								]}
							>
								{trait.trait_name}
							</Text>
							<Text style={styles.traitCount}>{trait.count} people</Text>
						</TouchableOpacity>
					))}
				</View>
			</View>

			{/* Skill Level */}
			<View style={styles.filterSection}>
				<Text style={styles.filterTitle}>Skill Level</Text>
				<View style={styles.filterGrid}>
					{PEOPLE_FILTER_SKILL_LEVELS.map((level) => (
						<TouchableOpacity
							key={level}
							style={[
								styles.filterChip,
								peopleFilters.skillLevels.includes(level) && styles.filterChipActive,
							]}
							onPress={() => toggleFilter('skillLevels', level)}
						>
							<Text
								style={[
									styles.filterChipText,
									peopleFilters.skillLevels.includes(level) && styles.filterChipTextActive,
								]}
							>
								{level}
							</Text>
						</TouchableOpacity>
					))}
				</View>
			</View>

			{/* Age Range */}
			<View style={styles.filterSection}>
				<Text style={styles.filterTitle}>Age Range</Text>
				<View style={styles.filterGrid}>
					{PEOPLE_FILTER_AGE_RANGES.map((age) => (
						<TouchableOpacity
							key={age}
							style={[
								styles.filterChip,
								peopleFilters.ageRanges.includes(age) && styles.filterChipActive,
							]}
							onPress={() => toggleFilter('ageRanges', age)}
						>
							<Text
								style={[
									styles.filterChipText,
									peopleFilters.ageRanges.includes(age) && styles.filterChipTextActive,
								]}
							>
								{age}
							</Text>
						</TouchableOpacity>
					))}
				</View>
			</View>

			{/* Group Size Preference */}
			<View style={styles.filterSection}>
				<Text style={styles.filterTitle}>Group Size Preference</Text>
				<View style={styles.filterGrid}>
					{PEOPLE_FILTER_GROUP_SIZES.map((size) => (
						<TouchableOpacity
							key={size}
							style={[
								styles.filterChip,
								peopleFilters.groupSizePreference.includes(size) && styles.filterChipActive,
							]}
							onPress={() => toggleFilter('groupSizePreference', size)}
						>
							<Text
								style={[
									styles.filterChipText,
									peopleFilters.groupSizePreference.includes(size) && styles.filterChipTextActive,
								]}
							>
								{size}
							</Text>
						</TouchableOpacity>
					))}
				</View>
			</View>
		</ScrollView>
	);

	return (
		<SafeAreaView style={styles.container}>
			<StatusBar barStyle="light-content" backgroundColor="#2C3E50" />
      
			{/* Header */}
			<LinearGradient
				colors={['#2C3E50', '#3498DB']}
				style={styles.header}
			>
				<View style={styles.headerContent}>
					<TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
						<Ionicons name="arrow-back" size={24} color="#FFFFFF" />
					</TouchableOpacity>
					<Text style={styles.title}>Smart Filters</Text>
					<TouchableOpacity onPress={clearAllFilters} style={styles.clearButton}>
						<Text style={styles.clearButtonText}>Clear</Text>
					</TouchableOpacity>
				</View>

				{/* Tabs removed: show only People Filter badge */}
				<View style={styles.tabContainer}>
					<View style={[styles.tabButton, styles.tabButtonActive]}
					>
						<Ionicons name="people" size={18} color="#2C3E50" />
						<Text style={[styles.tabButtonText, styles.tabButtonTextActive]}>People Filter</Text>
					</View>
				</View>
			</LinearGradient>

			{/* Content: People filters only */}
			{renderPeopleFilters()}

			{/* Apply Button */}
			<View style={styles.bottomBar}>
				<TouchableOpacity
					style={[styles.applyButton, isLoading && styles.applyButtonDisabled]}
					onPress={applyFilters}
					disabled={isLoading}
				>
					<Text style={styles.applyButtonText}>
						Apply {activeFiltersCount > 0 ? `${activeFiltersCount} ` : ''}Filters
					</Text>
				</TouchableOpacity>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#F8FAFC',
	},
	header: {
		paddingTop: 12,
		paddingBottom: 20,
		borderBottomLeftRadius: 24,
		borderBottomRightRadius: 24,
	},
	headerContent: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 20,
		marginBottom: 20,
	},
	backButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: 'rgba(255,255,255,0.2)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	title: {
		fontSize: 20,
		fontWeight: '700',
		color: '#FFFFFF',
	},
	clearButton: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 16,
		backgroundColor: 'rgba(255,255,255,0.2)',
	},
	clearButtonText: {
		fontSize: 14,
		fontWeight: '600',
		color: '#FFFFFF',
	},
	tabContainer: {
		flexDirection: 'row',
		paddingHorizontal: 20,
		gap: 8,
	},
	tabButton: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 12,
		borderRadius: 12,
		backgroundColor: 'rgba(255,255,255,0.1)',
		gap: 8,
	},
	tabButtonActive: {
		backgroundColor: '#FFFFFF',
	},
	tabButtonText: {
		fontSize: 14,
		fontWeight: '600',
		color: 'rgba(255,255,255,0.7)',
	},
	tabButtonTextActive: {
		color: '#2C3E50',
	},
	tabContent: {
		flex: 1,
		paddingTop: 20,
	},
	filterSection: {
		marginHorizontal: 20,
		marginBottom: 28,
	},
	loadingText: {
		marginHorizontal: 20,
		marginBottom: 12,
		fontSize: 12,
		color: '#6B7280',
	},
	traitCtaCard: {
		marginHorizontal: 20,
		marginBottom: 24,
		padding: 20,
		borderRadius: 20,
		backgroundColor: '#ECFDF5',
		borderWidth: 1,
		borderColor: '#A7F3D0',
	},
	traitCtaEyebrow: {
		fontSize: 12,
		fontWeight: '700',
		color: '#047857',
		textTransform: 'uppercase',
		marginBottom: 6,
		letterSpacing: 1,
	},
	traitCtaTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#064E3B',
		marginBottom: 6,
	},
	traitCtaBody: {
		fontSize: 14,
		color: '#065F46',
		marginBottom: 16,
	},
	traitCtaButton: {
		alignSelf: 'flex-start',
		paddingHorizontal: 18,
		paddingVertical: 10,
		borderRadius: 999,
		backgroundColor: '#10B981',
	},
	traitCtaButtonText: {
		color: '#FFFFFF',
		fontWeight: '700',
	},
	filterTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#1F2937',
		marginBottom: 6,
	},
	filterSubtitle: {
		fontSize: 14,
		color: '#6B7280',
		marginBottom: 16,
	},
	filterGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	filterChip: {
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 20,
		backgroundColor: '#FFFFFF',
		borderWidth: 1,
		borderColor: '#E5E7EB',
	},
	filterChipActive: {
		backgroundColor: '#3B82F6',
		borderColor: '#3B82F6',
	},
	filterChipText: {
		fontSize: 14,
		fontWeight: '500',
		color: '#374151',
	},
	filterChipTextActive: {
		color: '#FFFFFF',
	},
	traitsGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 12,
	},
	traitCard: {
		width: '47%',
		backgroundColor: '#FFFFFF',
		borderRadius: 12,
		padding: 16,
		alignItems: 'center',
		borderWidth: 2,
		borderColor: '#E5E7EB',
	},
	traitCardActive: {
		borderColor: '#3B82F6',
		backgroundColor: '#EBF4FF',
	},
	traitIcon: {
		fontSize: 28,
		marginBottom: 8,
	},
	traitName: {
		fontSize: 14,
		fontWeight: '600',
		color: '#374151',
		textAlign: 'center',
		marginBottom: 4,
	},
	traitNameActive: {
		color: '#3B82F6',
	},
	traitCount: {
		fontSize: 12,
		color: '#6B7280',
	},
	bottomBar: {
		padding: 20,
		backgroundColor: '#FFFFFF',
		borderTopWidth: 1,
		borderTopColor: '#E5E7EB',
	},
	applyButton: {
		backgroundColor: '#3B82F6',
		borderRadius: 12,
		paddingVertical: 16,
		alignItems: 'center',
	},
	applyButtonDisabled: {
		opacity: 0.6,
	},
	applyButtonText: {
		fontSize: 16,
		fontWeight: '700',
		color: '#FFFFFF',
	},
});
