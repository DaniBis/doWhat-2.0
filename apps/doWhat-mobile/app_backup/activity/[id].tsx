import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import ActivityDetailHeader from '../../components/ActivityDetailHeader';
import AttendanceInfo from '../../components/AttendanceInfo';
import RSVPButtons from '../../components/RSVPButtons';
import ActivityDetails from '../../components/ActivityDetails';
import { router } from 'expo-router';
import { formatPrice } from '@dowhat/shared';

type ActivityData = {
  id: string;
  name: string;
  description: string;
  venue_name: string;
  venue_address: string;
  starts_at: string;
  ends_at: string;
  price_cents: number;
  image_url?: string;
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams();
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [attendees, setAttendees] = useState({ total: 0, going: 0, interested: 0 });
  const [userRsvpStatus, setUserRsvpStatus] = useState<'going' | 'interested' | 'declined' | null>(null);

  useEffect(() => {
    const fetchActivityDetails = async () => {
      try {
        // Fetch activity details
        const { data: activityData, error: activityError } = await supabase
          .from('sessions')
          .select('*, activities(id, name, description), venues(name, address)')
          .eq('id', id)
          .single();

        if (activityError) throw activityError;

        if (activityData) {
          const formattedActivity = {
            id: activityData.id,
            name: activityData.activities?.name || 'Activity',
            description: activityData.activities?.description || 'No description available.',
            venue_name: activityData.venues?.name || 'Venue',
            venue_address: activityData.venues?.address || 'Address not provided',
            starts_at: activityData.starts_at,
            ends_at: activityData.ends_at,
            price_cents: activityData.price_cents || 0,
            image_url: activityData.image_url
          };
          setActivity(formattedActivity);
        }

        // Fetch attendees count
        const { data: rsvpData, error: rsvpError } = await supabase
          .from('rsvps')
          .select('status')
          .eq('session_id', id);

        if (rsvpError) throw rsvpError;

        if (rsvpData) {
          const going = rsvpData.filter(r => r.status === 'going').length;
          const interested = rsvpData.filter(r => r.status === 'interested').length;
          setAttendees({
            total: rsvpData.length,
            going,
            interested
          });
        }

        // Check user's RSVP status
        const { data: user } = await supabase.auth.getUser();
        if (user?.user?.id) {
          const { data: userRsvp } = await supabase
            .from('rsvps')
            .select('status')
            .eq('session_id', id)
            .eq('user_id', user.user.id)
            .maybeSingle();

          if (userRsvp) {
            setUserRsvpStatus(userRsvp.status as any);
          }
        }
      } catch (error) {
        console.error('Error fetching activity details:', error);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchActivityDetails();
    }
  }, [id]);

  const handleRsvp = async (status: 'going' | 'interested' | 'declined') => {
    try {
      const { data: user } = await supabase.auth.getUser();
      
      if (!user?.user?.id) {
        // Redirect to login if not logged in
        router.push('/login');
        return;
      }
      
      // Update or insert RSVP
      const { data, error } = await supabase
        .from('rsvps')
        .upsert({
          session_id: id as string,
          user_id: user.user.id,
          status
        })
        .select();

      if (error) throw error;
      
      setUserRsvpStatus(status);
      
      // Update attendee counts
      if (data) {
        // Simple update for UI - a more accurate approach would be to refetch
        const newAttendees = { ...attendees };
        if (userRsvpStatus === 'going') newAttendees.going--;
        if (userRsvpStatus === 'interested') newAttendees.interested--;
        if (status === 'going') newAttendees.going++;
        if (status === 'interested') newAttendees.interested++;
        setAttendees(newAttendees);
      }
    } catch (error) {
      console.error('Error updating RSVP:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#16A34A" />
      </View>
    );
  }

  if (!activity) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Activity not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <ActivityDetailHeader
        name={activity.name}
        locationName={activity.venue_name}
        date={formatDate(activity.starts_at)}
        time={`${formatTime(activity.starts_at)} - ${formatTime(activity.ends_at)}`}
        imageUri={activity.image_url}
      />
      
      <RSVPButtons
        onPressGoing={() => handleRsvp('going')}
        onPressInterested={() => handleRsvp('interested')}
        onPressDecline={() => handleRsvp('declined')}
        currentStatus={userRsvpStatus}
      />
      
      <AttendanceInfo
        attendeesCount={attendees.total}
        goingCount={attendees.going}
        interestedCount={attendees.interested}
        onPressAttendees={() => router.push(`/participants?activityId=${id}`)}
      />
      
      <ActivityDetails
        description={activity.description}
        price={formatPrice(activity.price_cents)}
        amenities={['Equipment provided', 'Beginner friendly', 'Indoor venue']}
      />
      
      <View style={styles.footer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
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
  },
  errorText: {
    fontSize: 16,
    color: 'red',
  },
  footer: {
    height: 24,
  },
});
