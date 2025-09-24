import React, { useState, useEffect } from 'react';
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

type FilterOptions = {
	// People filter options only
	personalityTraits: string[];
	skillLevels: string[];
	ageRanges: string[];
	groupSizePreference: string[];
};

type UserTrait = {
	trait_name: string;
	icon: string;
	color: string;
	count: number;
};

const availableTraits = [
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

// Removed Activity Filters (categories/timeSlots) to keep this screen focused on People filters

const skillLevels = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
const ageRanges = ['18-25', '26-35', '36-45', '46-55', '55+'];
const groupSizes = ['1-5 people', '6-15 people', '16-30 people', '30+ people'];

export default function PeopleFilterScreen() {
	const [filters, setFilters] = useState<FilterOptions>({
		personalityTraits: [],
		skillLevels: [],
		ageRanges: [],
		groupSizePreference: [],
	});
	const [nearbyTraits, setNearbyTraits] = useState<UserTrait[]>([]);

	useEffect(() => {
		fetchNearbyTraits();
	}, []);

	const fetchNearbyTraits = async () => {
		try {
			// For demo, simulate nearby trait data
			const traitCounts = availableTraits.map(trait => ({
				...trait,
				count: Math.floor(Math.random() * 50) + 5,
			}));
			setNearbyTraits(traitCounts.sort((a, b) => b.count - a.count));
		} catch (error) {
			console.error('Error fetching nearby traits:', error);
		}
	};

	const toggleFilter = (
		category:
			| 'personalityTraits'
			| 'skillLevels'
			| 'ageRanges'
			| 'groupSizePreference',
		value: string,
	) => {
		setFilters(prev => ({
			...prev,
			[category]: prev[category].includes(value)
				? prev[category].filter((item) => item !== value)
				: [...prev[category], value]
		}));
	};

	const getActiveFiltersCount = () => {
		return filters.personalityTraits.length +
					 filters.skillLevels.length +
					 filters.ageRanges.length +
				 filters.groupSizePreference.length;
	};

	const clearAllFilters = () => {
		setFilters({
			personalityTraits: [],
			skillLevels: [],
			ageRanges: [],
			groupSizePreference: [],
		});
	};

	const applyFilters = () => {
		// In a real app, this would apply the filters to the activity search
		console.log('Applying filters:', filters);
		router.back();
	};

	// Removed Activity Filters UI

	const renderPeopleFilters = () => (
		<ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
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
								filters.personalityTraits.includes(trait.trait_name) && styles.traitCardActive
							]}
							onPress={() => toggleFilter('personalityTraits', trait.trait_name)}
						>
							<Text style={styles.traitIcon}>{trait.icon}</Text>
							<Text style={[
								styles.traitName,
								filters.personalityTraits.includes(trait.trait_name) && styles.traitNameActive
							]}>
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
					{skillLevels.map((level) => (
						<TouchableOpacity
							key={level}
							style={[
								styles.filterChip,
								filters.skillLevels.includes(level) && styles.filterChipActive
							]}
							onPress={() => toggleFilter('skillLevels', level)}
						>
							<Text style={[
								styles.filterChipText,
								filters.skillLevels.includes(level) && styles.filterChipTextActive
							]}>
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
					{ageRanges.map((age) => (
						<TouchableOpacity
							key={age}
							style={[
								styles.filterChip,
								filters.ageRanges.includes(age) && styles.filterChipActive
							]}
							onPress={() => toggleFilter('ageRanges', age)}
						>
							<Text style={[
								styles.filterChipText,
								filters.ageRanges.includes(age) && styles.filterChipTextActive
							]}>
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
					{groupSizes.map((size) => (
						<TouchableOpacity
							key={size}
							style={[
								styles.filterChip,
								filters.groupSizePreference.includes(size) && styles.filterChipActive
							]}
							onPress={() => toggleFilter('groupSizePreference', size)}
						>
							<Text style={[
								styles.filterChipText,
								filters.groupSizePreference.includes(size) && styles.filterChipTextActive
							]}>
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
				<TouchableOpacity style={styles.applyButton} onPress={applyFilters}>
					<Text style={styles.applyButtonText}>
						Apply {getActiveFiltersCount() > 0 ? `${getActiveFiltersCount()} ` : ''}Filters
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
	applyButtonText: {
		fontSize: 16,
		fontWeight: '700',
		color: '#FFFFFF',
	},
});

