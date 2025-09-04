import React from 'react';
import { View, Text, StyleSheet, Image, ScrollView } from 'react-native';
import { AntDesign, FontAwesome } from '@expo/vector-icons';

type ActivityDetailsProps = {
  description: string;
  price: string;
  amenities: string[];
};

const ActivityDetails: React.FC<ActivityDetailsProps> = ({
  description,
  price,
  amenities,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>About</Text>
      <Text style={styles.description}>{description}</Text>

      <View style={styles.priceContainer}>
        <View style={styles.priceRow}>
          <FontAwesome name="euro" size={18} color="#555" />
          <Text style={styles.priceText}>{price}</Text>
        </View>
      </View>

      {amenities.length > 0 && (
        <View style={styles.amenitiesContainer}>
          <Text style={styles.sectionTitle}>Amenities</Text>
          <View style={styles.amenitiesList}>
            {amenities.map((amenity, index) => (
              <View key={index} style={styles.amenityItem}>
                <AntDesign name="check" size={16} color="#16A34A" />
                <Text style={styles.amenityText}>{amenity}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: 'white',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#444',
  },
  priceContainer: {
    marginTop: 16,
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  amenitiesContainer: {
    marginTop: 24,
  },
  amenitiesList: {
    marginTop: 8,
  },
  amenityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  amenityText: {
    fontSize: 15,
    marginLeft: 10,
    color: '#333',
  },
});

export default ActivityDetails;
