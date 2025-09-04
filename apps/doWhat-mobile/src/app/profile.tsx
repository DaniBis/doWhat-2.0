import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import ProfileHeader from '../components/ProfileHeader';
import ActivityList from '../components/ActivityList';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications, sendLocalTestNotification } from '../lib/notifications';

type UserProfile = {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
};

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
  price: number;
};


export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [savedActivities, setSavedActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [tab, setTab] = useState<'my' | 'saved'>('my');

  useEffect(() => {
    fetchUserProfile();
    fetchUserActivities();
    fetchSavedActivities();
    fetchFollowCounts();
  }, []);
  const fetchSavedActivities = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase
        .from('saved_activities')
        .select(`
          activity_id,
          activities (
            id,
            title,
            category,
            venue,
            venue_address,
            date,
            start_time,
            image_url,
            price,
            capacity
          )
        `)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const activitiesList = (data ?? []).map((r: any) => {
        const a = r.activities;
        return {
          id: a.id,
          title: a.title,
          category: a.category,
          venue: {
            name: a.venue,
            location: a.venue_address,
          },
          date: new Date(a.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
          }),
          time: a.start_time,
          imageUrl: a.image_url,
          attendees: 0, // Could fetch count if needed
          capacity: a.capacity,
          price: a.price || 0,
        };
      });
      setSavedActivities(activitiesList);
    } catch (error) {
      console.error('Error fetching saved activities:', error);
    }
  };

  const fetchUserProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url, expo_push_token')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;
      
      setPushToken((data?.expo_push_token as string) || null);
      
      setProfile({
        id: data.id,
        name: data.full_name || 'User',
        username: data.username || data.id.substring(0, 8),
        avatar_url: data.avatar_url
      });
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserActivities = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) return;

      // Fetch activities created by the user
      const { data, error } = await supabase
        .from('activities')
        .select(`
          id, 
          title, 
          category,
          venue,
          venue_address,
          date,
          start_time,
          image_url,
          price,
          capacity
        `)
        .eq('created_by', session.user.id)
        .order('date', { ascending: true });

      if (error) throw error;
      
      // For demo, use mockup data if no real data exists
      if (!data || data.length === 0) {
        setActivities([
          {
            id: '1',
            title: 'Morning Yoga in the Park',
            category: 'Fitness',
            venue: {
              name: 'Central Park',
              location: 'New York, NY'
            },
            date: 'Jul 15',
            time: '8:00 AM',
            imageUrl: null,
            attendees: 12,
            capacity: 20,
            price: 0
          },
          {
            id: '2',
            title: 'Coffee Tasting Experience',
            category: 'Food & Drink',
            venue: {
              name: 'Bean There Café',
              location: 'Brooklyn, NY'
            },
            date: 'Jul 22',
            time: '2:00 PM',
            imageUrl: null,
            attendees: 8,
            capacity: 15,
            price: 1500
          }
        ]);
        return;
      }
      
      // Get attendee count for each activity
      const activitiesWithAttendees = await Promise.all(data.map(async (activity) => {
        const { count, error: countError } = await supabase
          .from('rsvps')
          .select('id', { count: 'exact', head: true })
          .eq('activity_id', activity.id)
          .eq('status', 'going');
        
        if (countError) throw countError;
        
        return {
          id: activity.id,
          title: activity.title,
          category: activity.category,
          venue: {
            name: activity.venue,
            location: activity.venue_address,
          },
          date: new Date(activity.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
          }),
          time: activity.start_time,
          imageUrl: activity.image_url,
          attendees: count || 0,
          capacity: activity.capacity,
          price: activity.price || 0,
        };
      }));
      
      setActivities(activitiesWithAttendees);
    } catch (error) {
      console.error('Error fetching activities:', error);
    }
  };

  const fetchFollowCounts = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) return;
      
      // For demo, use mock data
      setFollowersCount(24);
      setFollowingCount(36);
      
      // In a real app, would fetch actual follow counts:
      /*
      // Count followers
      const { count: followersCount, error: followersError } = await supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', session.user.id);
      
      if (followersError) throw followersError;
      
      // Count following
      const { count: followingCount, error: followingError } = await supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', session.user.id);
      
      if (followingError) throw followingError;
      
      setFollowersCount(followersCount || 0);
      setFollowingCount(followingCount || 0);
      */
    } catch (error) {
      console.error('Error fetching follow counts:', error);
    }
  };

  const handleEditProfile = async () => {
    // In a real app, navigate to edit profile screen
    // For now, just enable notifications as a demo feature
    try {
      const token = await registerForPushNotifications(); 
      if (token) { 
        setPushToken(token);
      }
    } catch (error) {
      console.error('Error registering for push notifications:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2C7BF6" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Please sign in to view your profile</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ 
        title: 'Profile',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: 'white' },
      }} />
      <ProfileHeader
        name={profile.name}
        username={profile.username}
        avatarUri={profile.avatar_url}
        followersCount={followersCount}
        followingCount={followingCount}
        onEditProfile={handleEditProfile}
      />
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'my' && styles.activeTab]}
          onPress={() => setTab('my')}
        >
          <Text style={[styles.tabText, tab === 'my' && styles.activeTabText]}>My Activities</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'saved' && styles.activeTab]}
          onPress={() => setTab('saved')}
        >
          <Text style={[styles.tabText, tab === 'saved' && styles.activeTabText]}>Saved</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.scrollView}>
        {tab === 'my' ? (
          <ActivityList
            activities={activities}
            emptyMessage="You haven't created any activities yet."
          />
        ) : (
          <ActivityList
            activities={savedActivities}
            emptyMessage="You haven't saved any activities yet."
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 0,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: 'white',
    borderBottomWidth: 2,
    borderBottomColor: '#2C7BF6',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#2C7BF6',
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
});
