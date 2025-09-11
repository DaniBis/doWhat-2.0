import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Stack } = require('expo-router');
import ActivityList from '../components/ActivityList';
import { supabase } from '../lib/supabase';

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

export default function SavedScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSaved();
  }, []);

  const fetchSaved = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setActivities([]); return; }
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
      setActivities(activitiesList);
    } catch (error) {
      console.error('Error fetching saved activities:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2C7BF6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ 
        title: 'Saved',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: 'white' },
      }} />
      <ActivityList
        activities={activities}
        emptyMessage="You haven't saved any activities yet."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
