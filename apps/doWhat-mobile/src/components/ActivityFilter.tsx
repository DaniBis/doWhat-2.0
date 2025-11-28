import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView,
  Switch,
  TextInput
} from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';

type ActivityFilterProps = {
  onApplyFilters: (filters: FilterState) => void;
  initialFilters?: FilterState;
};

type ActivityCategory = {
  id: string;
  name: string;
};

type FilterState = {
  categories: string[];
  maxDistance: number;
  price: [number, number];
  daysOfWeek: string[];
  timeOfDay: string[];
  indoorOnly: boolean;
  outdoorOnly: boolean;
};

const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const timeSlots = ['Morning', 'Afternoon', 'Evening'];

const ActivityFilter: React.FC<ActivityFilterProps> = ({ 
  onApplyFilters,
  initialFilters 
}) => {
  const [filters, setFilters] = useState<FilterState>(
    initialFilters || {
      categories: [],
      maxDistance: 25,
      price: [0, 10000], // cents (0-100 EUR)
      daysOfWeek: [],
      timeOfDay: [],
      indoorOnly: false,
      outdoorOnly: false
    }
  );
  
  const [availableCategories, setAvailableCategories] = useState<ActivityCategory[]>([]);

  useEffect(() => {
    // Fetch available activity categories
    const fetchCategories = async () => {
      try {
        const { data, error } = await supabase
          .from('activities')
          .select('id, name')
          .order('name');
        
        if (error) throw error;
        
        if (data) {
          setAvailableCategories(data);
        }
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    };
    
    fetchCategories();
  }, []);

  const toggleCategory = (categoryId: string) => {
    setFilters(prev => {
      if (prev.categories.includes(categoryId)) {
        return {
          ...prev,
          categories: prev.categories.filter(id => id !== categoryId)
        };
      } else {
        return {
          ...prev,
          categories: [...prev.categories, categoryId]
        };
      }
    });
  };

  const toggleDayOfWeek = (day: string) => {
    setFilters(prev => {
      if (prev.daysOfWeek.includes(day)) {
        return {
          ...prev,
          daysOfWeek: prev.daysOfWeek.filter(d => d !== day)
        };
      } else {
        return {
          ...prev,
          daysOfWeek: [...prev.daysOfWeek, day]
        };
      }
    });
  };

  const toggleTimeOfDay = (time: string) => {
    setFilters(prev => {
      if (prev.timeOfDay.includes(time)) {
        return {
          ...prev,
          timeOfDay: prev.timeOfDay.filter(t => t !== time)
        };
      } else {
        return {
          ...prev,
          timeOfDay: [...prev.timeOfDay, time]
        };
      }
    });
  };

  const handleApplyFilters = () => {
    onApplyFilters(filters);
    router.back();
  };

  const handleReset = () => {
    setFilters({
      categories: [],
      maxDistance: 25,
      price: [0, 10000],
      daysOfWeek: [],
      timeOfDay: [],
      indoorOnly: false,
      outdoorOnly: false
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <AntDesign name="close" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Filter Activities</Text>
        <TouchableOpacity onPress={handleReset}>
          <Text style={styles.resetText}>Reset</Text>
        </TouchableOpacity>
      </View>
      
      <ScrollView style={styles.scrollContainer}>
        {/* Categories Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity Type</Text>
          <View style={styles.categoriesContainer}>
            {availableCategories.map(category => (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.categoryChip,
                  filters.categories.includes(category.id) && styles.categoryChipSelected
                ]}
                onPress={() => toggleCategory(category.id)}
              >
                <Text 
                  style={[
                    styles.categoryText,
                    filters.categories.includes(category.id) && styles.categoryTextSelected
                  ]}
                >
                  {category.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        
        {/* Distance Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Maximum Distance</Text>
          <Text style={styles.distanceValue}>{filters.maxDistance} km</Text>
          <TextInput
            style={styles.input}
            value={filters.maxDistance.toString()}
            onChangeText={(text) => setFilters(prev => ({ ...prev, maxDistance: parseInt(text) || 1 }))}
            keyboardType="numeric"
            placeholder="Enter distance in km"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>1 km</Text>
            <Text style={styles.sliderLabel}>50 km</Text>
          </View>
        </View>
        
        {/* Price Range */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price Range</Text>
          <Text style={styles.priceValue}>
            €{(filters.price[0] / 100).toFixed(2)} - €{(filters.price[1] / 100).toFixed(2)}
          </Text>
          <TextInput
            style={styles.input}
            value={(filters.price[1] / 100).toString()}
            onChangeText={(text) => setFilters(prev => ({ 
              ...prev, 
              price: [prev.price[0], (parseFloat(text) || 0) * 100] 
            }))}
            keyboardType="numeric"
            placeholder="Enter max price in euros"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>€0</Text>
            <Text style={styles.sliderLabel}>€100</Text>
          </View>
        </View>
        
        {/* Days of Week */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Days</Text>
          <View style={styles.daysContainer}>
            {daysOfWeek.map(day => (
              <TouchableOpacity
                key={day}
                style={[
                  styles.dayChip,
                  filters.daysOfWeek.includes(day) && styles.dayChipSelected
                ]}
                onPress={() => toggleDayOfWeek(day)}
              >
                <Text 
                  style={[
                    styles.dayText,
                    filters.daysOfWeek.includes(day) && styles.dayTextSelected
                  ]}
                >
                  {day}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        
        {/* Time of Day */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Time</Text>
          <View style={styles.timeContainer}>
            {timeSlots.map(time => (
              <TouchableOpacity
                key={time}
                style={[
                  styles.timeChip,
                  filters.timeOfDay.includes(time) && styles.timeChipSelected
                ]}
                onPress={() => toggleTimeOfDay(time)}
              >
                <Text 
                  style={[
                    styles.timeText,
                    filters.timeOfDay.includes(time) && styles.timeTextSelected
                  ]}
                >
                  {time}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        
        {/* Indoor/Outdoor */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location Type</Text>
          
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Indoor Only</Text>
            <Switch
              value={filters.indoorOnly}
              onValueChange={(value) => {
                setFilters(prev => ({ 
                  ...prev, 
                  indoorOnly: value,
                  // If turning on indoor, turn off outdoor
                  outdoorOnly: value ? false : prev.outdoorOnly
                }))
              }}
              trackColor={{ false: "#D1D5DB", true: "#2C7BF6" }}
              thumbColor="#fff"
            />
          </View>
          
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Outdoor Only</Text>
            <Switch
              value={filters.outdoorOnly}
              onValueChange={(value) => {
                setFilters(prev => ({ 
                  ...prev, 
                  outdoorOnly: value,
                  // If turning on outdoor, turn off indoor
                  indoorOnly: value ? false : prev.indoorOnly
                }))
              }}
              trackColor={{ false: "#D1D5DB", true: "#2C7BF6" }}
              thumbColor="#fff"
            />
          </View>
        </View>
      </ScrollView>
      
      <View style={styles.footer}>
        <TouchableOpacity style={styles.applyButton} onPress={handleApplyFilters}>
          <Text style={styles.applyButtonText}>Apply Filters</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  resetText: {
    fontSize: 14,
    color: '#2C7BF6',
    fontWeight: '600',
  },
  scrollContainer: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: 'white',
    marginRight: 8,
    marginBottom: 8,
  },
  categoryChipSelected: {
    backgroundColor: '#EBF4FF',
    borderColor: '#2C7BF6',
  },
  categoryText: {
    color: '#4B5563',
  },
  categoryTextSelected: {
    color: '#2C7BF6',
    fontWeight: '600',
  },
  distanceValue: {
    textAlign: 'right',
    color: '#2C7BF6',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  sliderThumb: {
    width: 20,
    height: 20,
    backgroundColor: '#2C7BF6',
  },
  sliderTrack: {
    height: 4,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sliderLabel: {
    color: '#6B7280',
    fontSize: 12,
  },
  priceValue: {
    textAlign: 'right',
    color: '#2C7BF6',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  daysContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayChipSelected: {
    backgroundColor: '#EBF4FF',
    borderColor: '#2C7BF6',
  },
  dayText: {
    color: '#4B5563',
    fontSize: 12,
  },
  dayTextSelected: {
    color: '#2C7BF6',
    fontWeight: '600',
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  timeChipSelected: {
    backgroundColor: '#EBF4FF',
    borderColor: '#2C7BF6',
  },
  timeText: {
    color: '#4B5563',
  },
  timeTextSelected: {
    color: '#2C7BF6',
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  switchLabel: {
    fontSize: 16,
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    marginVertical: 8,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  applyButton: {
    backgroundColor: '#2C7BF6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ActivityFilter;
