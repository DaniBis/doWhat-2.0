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
import { theme } from '@dowhat/shared';

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
          onPress={() => router.push({ pathname: '/activities/[id]', params: { id: item.id, name: item.title } })}
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
                <MaterialCommunityIcons name="map-marker" size={16} color={theme.colors.ink60} />
                <Text style={styles.venue} numberOfLines={1}>{item.venue.name}</Text>
                {showDistance && item.distance !== undefined && (
                  <Text style={styles.distance}>{item.distance.toFixed(1)} km</Text>
                )}
              </View>
              
              <View style={styles.detailRow}>
                <MaterialCommunityIcons name="calendar" size={16} color={theme.colors.ink60} />
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
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    overflow: 'hidden',
  },
  image: {
    height: 140,
    width: '100%',
    resizeMode: 'cover',
  },
  contentContainer: {
    padding: 14,
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
    color: theme.colors.brandInk,
    marginBottom: 2,
  },
  category: {
    fontSize: 14,
    color: theme.colors.ink60,
  },
  price: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.brandInk,
  },
  freeTag: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.success,
    backgroundColor: 'rgba(16,185,129,0.12)',
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
    color: theme.colors.ink80,
    marginLeft: 6,
    flex: 1,
  },
  distance: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.ink40,
    marginLeft: 8,
  },
  dateTime: {
    fontSize: 14,
    color: theme.colors.ink80,
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
    color: theme.colors.ink60,
    marginBottom: 4,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: theme.colors.ink20,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.colors.brandTeal,
  },
});

export default ActivityList;
