import React from 'react';
import type { ComponentProps } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  StyleSheet, 
  Image, 
  TouchableOpacity 
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import EmptyState from './EmptyState';

type Activity = {
  id: string;
  title: string;
  category: string;
  venue: {
    name: string;
    location: string;
  };
  date: string;
  time: string;
  imageUrl?: string | null;
  attendees: number;
  capacity: number;
  distance?: number; // in km, optional for non-nearby lists
  price: number; // in cents
};

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type ActivityListProps = {
  activities: Activity[];
  showDistance?: boolean;
  emptyMessage?: string;
  emptyIcon?: IoniconName;
  emptyActionText?: string;
  emptyActionRoute?: string;
};

const ActivityList: React.FC<ActivityListProps> = ({ 
  activities, 
  showDistance = false,
  emptyMessage = "No activities found",
  emptyIcon = "calendar-outline",
  emptyActionText,
  emptyActionRoute,
}) => {
  if (activities.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title="No Activities"
        subtitle={emptyMessage}
        actionText={emptyActionText}
        actionRoute={emptyActionRoute}
      />
    );
  }

  return (
    <FlatList
      data={activities}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <TouchableOpacity 
          style={styles.card} 
          onPress={() => router.push(`/activities/${item.id}`)}
        >
          <Image
            source={item.imageUrl ? { uri: item.imageUrl } : require('../../assets/icon.png')}
            style={styles.image}
          />
          
          <View style={styles.contentContainer}>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.category}>{item.category}</Text>
              </View>
              {item.price > 0 ? (
                <Text style={styles.price}>€{(item.price / 100).toFixed(2)}</Text>
              ) : (
                <Text style={styles.freeTag}>FREE</Text>
              )}
            </View>
            
            <View style={styles.details}>
              <View style={styles.detailRow}>
                <MaterialCommunityIcons name="map-marker" size={16} color="#6B7280" />
                <Text style={styles.venue} numberOfLines={1}>{item.venue.name}</Text>
                {showDistance && item.distance !== undefined && (
                  <Text style={styles.distance}>{item.distance.toFixed(1)} km</Text>
                )}
              </View>
              
              <View style={styles.detailRow}>
                <MaterialCommunityIcons name="calendar" size={16} color="#6B7280" />
                <Text style={styles.dateTime}>{item.date} • {item.time}</Text>
              </View>
              
              <View style={styles.footer}>
                <View style={styles.attendanceContainer}>
                  <Text style={styles.attendees}>
                    {item.attendees}/{item.capacity} going
                  </Text>
                  <View style={styles.progressBarContainer}>
                    <View 
                      style={[
                        styles.progressBar, 
                        { width: `${Math.min(100, (item.attendees / item.capacity) * 100)}%` }
                      ]} 
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      )}
    />
  );
};

const styles = StyleSheet.create({
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  image: {
    height: 140,
    width: '100%',
    resizeMode: 'cover',
  },
  contentContainer: {
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 2,
  },
  category: {
    fontSize: 14,
    color: '#6B7280',
  },
  price: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
  },
  freeTag: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#10B981',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  details: {
    marginTop: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  venue: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 6,
    flex: 1,
  },
  distance: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginLeft: 8,
  },
  dateTime: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 6,
  },
  footer: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attendanceContainer: {
    flex: 1,
  },
  attendees: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 4,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#2C7BF6',
  },
});

export default ActivityList;
