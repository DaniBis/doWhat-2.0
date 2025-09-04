import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  TouchableOpacity, 
  ScrollView,
  Alert 
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FilterModal from '../components/FilterModal';

type FilterOptions = {
  radius: number;
  priceRange: [number, number];
  categories: string[];
  timeOfDay: string[];
};

export default function FilterScreen() {
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    radius: 10,
    priceRange: [0, 100],
    categories: [],
    timeOfDay: [],
  });

  const handleApplyFilters = (newFilters: FilterOptions) => {
    setFilters(newFilters);
    Alert.alert('Filters Applied', 'Your filter preferences have been saved!');
    // In a real app, you would apply these filters to the activity search
  };

  const activeFiltersCount = 
    filters.categories.length + 
    filters.timeOfDay.length + 
    (filters.radius !== 10 ? 1 : 0) +
    (filters.priceRange[0] !== 0 || filters.priceRange[1] !== 100 ? 1 : 0);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.title}>Activity Filters</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Current Filters Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Filters</Text>
          {activeFiltersCount === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="options-outline" size={48} color="#9CA3AF" />
              <Text style={styles.emptyStateText}>No filters applied</Text>
              <Text style={styles.emptyStateSubtext}>
                Tap "Edit Filters" below to customize your search
              </Text>
            </View>
          ) : (
            <View style={styles.filtersPreview}>
              {filters.radius !== 10 && (
                <View style={styles.filterTag}>
                  <Text style={styles.filterTagText}>📍 {filters.radius} miles</Text>
                </View>
              )}
              {(filters.priceRange[0] !== 0 || filters.priceRange[1] !== 100) && (
                <View style={styles.filterTag}>
                  <Text style={styles.filterTagText}>
                    💰 ${filters.priceRange[0]} - ${filters.priceRange[1]}
                  </Text>
                </View>
              )}
              {filters.categories.map((category) => (
                <View key={category} style={styles.filterTag}>
                  <Text style={styles.filterTagText}>🏷️ {category}</Text>
                </View>
              ))}
              {filters.timeOfDay.map((time) => (
                <View key={time} style={styles.filterTag}>
                  <Text style={styles.filterTagText}>⏰ {time}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Filter Actions */}
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.editButton}
            onPress={() => setShowFilterModal(true)}
          >
            <Ionicons name="options" size={20} color="#3B82F6" />
            <Text style={styles.editButtonText}>Edit Filters</Text>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>

          {activeFiltersCount > 0 && (
            <TouchableOpacity 
              style={styles.clearButton}
              onPress={() => setFilters({
                radius: 10,
                priceRange: [0, 100],
                categories: [],
                timeOfDay: [],
              })}
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={styles.clearButtonText}>Clear All Filters</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How Filters Work</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              • <Text style={styles.infoTextBold}>Distance:</Text> Only show activities within your selected radius
            </Text>
            <Text style={styles.infoText}>
              • <Text style={styles.infoTextBold}>Price:</Text> Filter activities by cost range
            </Text>
            <Text style={styles.infoText}>
              • <Text style={styles.infoTextBold}>Categories:</Text> Show only activities matching your interests
            </Text>
            <Text style={styles.infoText}>
              • <Text style={styles.infoTextBold}>Time:</Text> Find activities happening at your preferred times
            </Text>
          </View>
        </View>
      </ScrollView>

      <FilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        onApply={handleApplyFilters}
        initialFilters={filters}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  section: {
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
  },
  filtersPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterTag: {
    backgroundColor: '#EBF4FF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  filterTagText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  editButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
    marginLeft: 12,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#EF4444',
    marginLeft: 8,
  },
  infoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 8,
  },
  infoTextBold: {
    fontWeight: '600',
    color: '#374151',
  },
});
