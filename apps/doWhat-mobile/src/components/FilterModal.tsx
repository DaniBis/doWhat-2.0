import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

type FilterOptions = {
  radius: number;
  priceRange: [number, number];
  categories: string[];
  timeOfDay: string[];
};

type FilterModalProps = {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: FilterOptions) => void;
  initialFilters?: FilterOptions;
};

const categories = [
  { id: 'fitness', name: 'Fitness', icon: '💪' },
  { id: 'food', name: 'Food & Drink', icon: '🍽️' },
  { id: 'arts', name: 'Arts & Culture', icon: '🎨' },
  { id: 'outdoor', name: 'Outdoor', icon: '🌲' },
  { id: 'social', name: 'Social', icon: '👥' },
  { id: 'learning', name: 'Learning', icon: '📚' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎪' },
  { id: 'wellness', name: 'Wellness', icon: '🧘' },
];

const timeSlots = [
  { id: 'morning', name: 'Morning (6AM - 12PM)', icon: '🌅' },
  { id: 'afternoon', name: 'Afternoon (12PM - 6PM)', icon: '☀️' },
  { id: 'evening', name: 'Evening (6PM - 10PM)', icon: '🌇' },
  { id: 'night', name: 'Night (10PM - 6AM)', icon: '🌙' },
];

const FilterModal: React.FC<FilterModalProps> = ({
  visible,
  onClose,
  onApply,
  initialFilters = {
    radius: 10,
    priceRange: [0, 100],
    categories: [],
    timeOfDay: [],
  },
}) => {
  const [filters, setFilters] = useState<FilterOptions>(initialFilters);

  const toggleCategory = (categoryId: string) => {
    setFilters(prev => ({
      ...prev,
      categories: prev.categories.includes(categoryId)
        ? prev.categories.filter(id => id !== categoryId)
        : [...prev.categories, categoryId],
    }));
  };

  const toggleTimeSlot = (timeId: string) => {
    setFilters(prev => ({
      ...prev,
      timeOfDay: prev.timeOfDay.includes(timeId)
        ? prev.timeOfDay.filter(id => id !== timeId)
        : [...prev.timeOfDay, timeId],
    }));
  };

  const resetFilters = () => {
    setFilters({
      radius: 10,
      priceRange: [0, 100],
      categories: [],
      timeOfDay: [],
    });
  };

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  const activeFiltersCount = 
    filters.categories.length + 
    filters.timeOfDay.length + 
    (filters.radius !== 10 ? 1 : 0) +
    (filters.priceRange[0] !== 0 || filters.priceRange[1] !== 100 ? 1 : 0);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <BlurView intensity={20} style={styles.backdrop}>
        <View style={styles.modalContainer}>
          <View style={styles.modal}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Filter Activities</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {/* Distance Radius */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Distance Radius</Text>
                <View style={styles.sliderContainer}>
                  <View style={styles.customSlider}>
                    <View style={styles.sliderTrack}>
                      <View style={[styles.sliderFill, { width: `${(filters.radius / 50) * 100}%` }]} />
                      <TouchableOpacity 
                        style={[styles.sliderThumb, { left: `${(filters.radius / 50) * 100}%` }]}
                        onPress={() => {}} // Simplified - in real app would implement drag
                      />
                    </View>
                    <View style={styles.sliderLabels}>
                      <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, radius: 5 }))}>
                        <Text style={styles.sliderLabel}>5mi</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, radius: 15 }))}>
                        <Text style={styles.sliderLabel}>15mi</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, radius: 30 }))}>
                        <Text style={styles.sliderLabel}>30mi</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, radius: 50 }))}>
                        <Text style={styles.sliderLabel}>50mi</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.sliderValue}>{filters.radius} miles</Text>
                </View>
              </View>

              {/* Price Range */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Price Range</Text>
                <View style={styles.priceContainer}>
                  <View style={styles.priceInputContainer}>
                    <Text style={styles.priceLabel}>$</Text>
                    <Text style={styles.priceValue}>{filters.priceRange[0]}</Text>
                  </View>
                  <Text style={styles.priceSeparator}>to</Text>
                  <View style={styles.priceInputContainer}>
                    <Text style={styles.priceLabel}>$</Text>
                    <Text style={styles.priceValue}>{filters.priceRange[1]}</Text>
                  </View>
                </View>
              </View>

              {/* Categories */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Categories</Text>
                <View style={styles.optionsGrid}>
                  {categories.map((category) => (
                    <TouchableOpacity
                      key={category.id}
                      style={[
                        styles.optionCard,
                        filters.categories.includes(category.id) && styles.optionCardSelected,
                      ]}
                      onPress={() => toggleCategory(category.id)}
                    >
                      <Text style={styles.optionIcon}>{category.icon}</Text>
                      <Text style={[
                        styles.optionText,
                        filters.categories.includes(category.id) && styles.optionTextSelected,
                      ]}>
                        {category.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Time of Day */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Time of Day</Text>
                <View style={styles.timeSlots}>
                  {timeSlots.map((slot) => (
                    <TouchableOpacity
                      key={slot.id}
                      style={[
                        styles.timeSlot,
                        filters.timeOfDay.includes(slot.id) && styles.timeSlotSelected,
                      ]}
                      onPress={() => toggleTimeSlot(slot.id)}
                    >
                      <Text style={styles.timeSlotIcon}>{slot.icon}</Text>
                      <Text style={[
                        styles.timeSlotText,
                        filters.timeOfDay.includes(slot.id) && styles.timeSlotTextSelected,
                      ]}>
                        {slot.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
              <TouchableOpacity onPress={resetFilters} style={styles.resetButton}>
                <Text style={styles.resetText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleApply} style={styles.applyButton}>
                <Text style={styles.applyText}>
                  Apply {activeFiltersCount > 0 && `(${activeFiltersCount})`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
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
  sliderContainer: {
    paddingHorizontal: 8,
  },
  customSlider: {
    marginBottom: 8,
  },
  sliderTrack: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    position: 'relative',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute',
    top: -8,
    width: 20,
    height: 20,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    transform: [{ translateX: -10 }],
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  sliderValue: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flex: 1,
  },
  priceLabel: {
    fontSize: 16,
    color: '#6B7280',
    marginRight: 4,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  priceSeparator: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#9CA3AF',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  optionCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    minWidth: 80,
    flex: 1,
    maxWidth: '48%',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  optionCardSelected: {
    backgroundColor: '#EBF4FF',
    borderColor: '#3B82F6',
  },
  optionIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  optionText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  timeSlots: {
    gap: 8,
  },
  timeSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  timeSlotSelected: {
    backgroundColor: '#EBF4FF',
    borderColor: '#3B82F6',
  },
  timeSlotIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  timeSlotText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  timeSlotTextSelected: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  resetButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  resetText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  applyButton: {
    flex: 2,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  applyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default FilterModal;
