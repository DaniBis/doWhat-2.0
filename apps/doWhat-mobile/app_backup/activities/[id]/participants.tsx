import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  Image,
  TouchableOpacity, 
  ActivityIndicator 
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { createClient } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';

// Initialize Supabase client
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Participant = {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  status: 'going' | 'interested' | 'not_going';
  created_at: string;
};

export default function ParticipantsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activityTitle, setActivityTitle] = useState<string>('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'going' | 'interested'>('all');

  useEffect(() => {
    if (!id) return;
    fetchParticipants();
    fetchActivityDetails();
  }, [id]);

  const fetchActivityDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('activities')
        .select('title')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (data) setActivityTitle(data.title);
    } catch (error) {
      console.error('Error fetching activity details:', error);
    }
  };

  const fetchParticipants = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('rsvps')
        .select(`
          id,
          status,
          created_at,
          user_id,
          profiles:user_id (
            id,
            name:full_name,
            username,
            avatar_url
          )
        `)
        .eq('activity_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        // Transform data to match Participant type
        const transformedData = data.map((item: any) => ({
          id: item.profiles?.id || item.user_id,
          name: item.profiles?.name || 'Anonymous User',
          username: item.profiles?.username || (item.profiles?.id || item.user_id).substring(0, 8),
          avatar_url: item.profiles?.avatar_url,
          status: item.status as 'going' | 'interested' | 'not_going',
          created_at: item.created_at
        }));

        setParticipants(transformedData);
      }
    } catch (error) {
      console.error('Error fetching participants:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredParticipants = participants.filter(p => {
    if (filter === 'all') return true;
    return p.status === filter;
  });

  const renderParticipant = ({ item }: { item: Participant }) => (
    <TouchableOpacity 
      style={styles.participantCard}
      onPress={() => {
        // Navigate to user profile (in a real app)
        console.log(`Navigate to profile for user ${item.id}`);
      }}
    >
      <Image 
        source={
            item.avatar_url 
            ? { uri: item.avatar_url }
            : require('../../../../assets/icon.png')
          }
        style={styles.avatar}
      />
      
      <View style={styles.participantInfo}>
        <Text style={styles.participantName}>{item.name}</Text>
        <Text style={styles.participantUsername}>@{item.username}</Text>
      </View>
      
      <View style={[
        styles.statusBadge,
        item.status === 'going' ? styles.goingBadge : 
        item.status === 'interested' ? styles.interestedBadge : 
        styles.notGoingBadge
      ]}>
        <Text style={styles.statusText}>
          {item.status === 'going' ? 'Going' : 
           item.status === 'interested' ? 'Interested' : 
           'Not Going'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Participants',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: 'white' },
        }}
      />
      
      <View style={styles.header}>
        <Text style={styles.activityTitle} numberOfLines={1}>
          {activityTitle || 'Activity Participants'}
        </Text>
        
        <View style={styles.filterContainer}>
          <TouchableOpacity 
            style={[styles.filterButton, filter === 'all' && styles.activeFilter]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterText, filter === 'all' && styles.activeFilterText]}>
              All
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.filterButton, filter === 'going' && styles.activeFilter]}
            onPress={() => setFilter('going')}
          >
            <Text style={[styles.filterText, filter === 'going' && styles.activeFilterText]}>
              Going
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.filterButton, filter === 'interested' && styles.activeFilter]}
            onPress={() => setFilter('interested')}
          >
            <Text style={[styles.filterText, filter === 'interested' && styles.activeFilterText]}>
              Interested
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2C7BF6" />
        </View>
      ) : filteredParticipants.length > 0 ? (
        <FlatList
          data={filteredParticipants}
          keyExtractor={item => item.id}
          renderItem={renderParticipant}
          contentContainerStyle={styles.listContainer}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="people" size={60} color="#D1D5DB" />
          <Text style={styles.emptyText}>
            {filter === 'all' ? 'No participants yet' : 
             filter === 'going' ? 'No one is going yet' : 
             'No one is interested yet'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  activityTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 4,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeFilter: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 2,
  },
  filterText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  activeFilterText: {
    color: '#2C7BF6',
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  participantCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  participantInfo: {
    flex: 1,
    marginLeft: 12,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  participantUsername: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  goingBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  interestedBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  notGoingBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#10B981',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 12,
  },
});
