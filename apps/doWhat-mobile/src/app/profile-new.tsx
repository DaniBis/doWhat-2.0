import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import ProfileHeader from '../components/ProfileHeader';
import ActivityList from '../components/ActivityList';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications } from '../lib/notifications';

type UserProfile = {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  bio?: string;
  location?: string;
  skill_level?: string;
  age_range?: string;
};

type UserTrait = {
  id: string;
  trait_type: string;
  trait_name: string;
  icon: string;
  color: string;
};

type UserBadge = {
  id: string;
  badge_type: string;
  badge_name: string;
  badge_description: string;
  icon: string;
  color: string;
  earned_at: string;
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

const predefinedTraits = [
  { trait_type: 'behavior', trait_name: 'Early Bird', icon: '🌅', color: '#F59E0B' },
  { trait_type: 'behavior', trait_name: 'Night Owl', icon: '🦉', color: '#7C3AED' },
  { trait_type: 'behavior', trait_name: 'Social Butterfly', icon: '🦋', color: '#EC4899' },
  { trait_type: 'behavior', trait_name: 'Adventure Seeker', icon: '🏔️', color: '#059669' },
  { trait_type: 'interest', trait_name: 'Fitness Enthusiast', icon: '💪', color: '#DC2626' },
  { trait_type: 'interest', trait_name: 'Foodie', icon: '🍕', color: '#EA580C' },
  { trait_type: 'interest', trait_name: 'Art Lover', icon: '🎨', color: '#9333EA' },
  { trait_type: 'interest', trait_name: 'Music Fan', icon: '🎵', color: '#0EA5E9' },
  { trait_type: 'interest', trait_name: 'Tech Geek', icon: '💻', color: '#059669' },
  { trait_type: 'preference', trait_name: 'Small Groups', icon: '👥', color: '#7C3AED' },
  { trait_type: 'preference', trait_name: 'Large Events', icon: '🎪', color: '#DC2626' },
  { trait_type: 'preference', trait_name: 'Indoor Activities', icon: '🏠', color: '#0EA5E9' },
  { trait_type: 'preference', trait_name: 'Outdoor Activities', icon: '🌳', color: '#059669' },
];

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [userTraits, setUserTraits] = useState<UserTrait[]>([]);
  const [userBadges, setUserBadges] = useState<UserBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [tab, setTab] = useState<'profile' | 'activities' | 'badges'>('profile');
  const [showTraitSelector, setShowTraitSelector] = useState(false);

  useEffect(() => {
    fetchUserProfile();
    fetchUserActivities();
    fetchFollowCounts();
    fetchUserTraits();
    fetchUserBadges();
  }, []);

  const fetchUserTraits = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // For demo, set some default traits
      setUserTraits([
        { id: '1', trait_type: 'behavior', trait_name: 'Early Bird', icon: '🌅', color: '#F59E0B' },
        { id: '2', trait_type: 'interest', trait_name: 'Fitness Enthusiast', icon: '💪', color: '#DC2626' },
        { id: '3', trait_type: 'preference', trait_name: 'Small Groups', icon: '👥', color: '#7C3AED' },
      ]);
    } catch (error) {
      console.error('Error fetching user traits:', error);
    }
  };

  const fetchUserBadges = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // For demo, set some default badges
      setUserBadges([
        { id: '1', badge_type: 'achievement', badge_name: 'First Timer', badge_description: 'Attended your first event', icon: '🌟', color: '#F59E0B', earned_at: '2024-01-15' },
        { id: '2', badge_type: 'skill_level', badge_name: 'Beginner', badge_description: 'Just getting started', icon: '🌱', color: '#84CC16', earned_at: '2024-01-01' },
        { id: '3', badge_type: 'participation', badge_name: 'Social Explorer', badge_description: 'Attended 5 different activities', icon: '🗺️', color: '#0EA5E9', earned_at: '2024-02-01' },
      ]);
    } catch (error) {
      console.error('Error fetching user badges:', error);
    }
  };

  const addUserTrait = async (trait: typeof predefinedTraits[0]) => {
    try {
      const newTrait: UserTrait = {
        id: Date.now().toString(),
        trait_type: trait.trait_type,
        trait_name: trait.trait_name,
        icon: trait.icon,
        color: trait.color,
      };
      setUserTraits(prev => [newTrait, ...prev]);
    } catch (error) {
      console.error('Error adding trait:', error);
    }
  };

  const removeUserTrait = async (traitId: string) => {
    try {
      setUserTraits(prev => prev.filter(t => t.id !== traitId));
    } catch (error) {
      console.error('Error removing trait:', error);
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
        .select('id, full_name, username, avatar_url, bio, location, skill_level, age_range, expo_push_token')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;
      
      setPushToken((data?.expo_push_token as string) || null);
      
      setProfile({
        id: data.id,
        name: data.full_name || 'User',
        username: data.username || data.id.substring(0, 8),
        avatar_url: data.avatar_url,
        bio: data.bio || "Welcome to my profile! I love discovering new activities and meeting amazing people.",
        location: data.location || "San Francisco, CA",
        skill_level: data.skill_level || "Intermediate",
        age_range: data.age_range || "25-35",
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

      // For demo, use mockup data
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
    } catch (error) {
      console.error('Error fetching activities:', error);
    }
  };

  const fetchFollowCounts = async () => {
    try {
      // For demo, use mock data
      setFollowersCount(24);
      setFollowingCount(36);
    } catch (error) {
      console.error('Error fetching follow counts:', error);
    }
  };

  const handleEditProfile = async () => {
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

  const renderProfileTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* Profile Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About Me</Text>
        <View style={styles.infoCard}>
          <Text style={styles.bioText}>{profile.bio}</Text>
          
          {profile.location && (
            <View style={styles.infoRow}>
              <Ionicons name="location" size={16} color="#6B7280" />
              <Text style={styles.infoText}>{profile.location}</Text>
            </View>
          )}
          
          {profile.skill_level && (
            <View style={styles.infoRow}>
              <Ionicons name="trending-up" size={16} color="#6B7280" />
              <Text style={styles.infoText}>Skill Level: {profile.skill_level}</Text>
            </View>
          )}

          {profile.age_range && (
            <View style={styles.infoRow}>
              <Ionicons name="person" size={16} color="#6B7280" />
              <Text style={styles.infoText}>Age Range: {profile.age_range}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Personality Traits */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Personality Traits</Text>
          <TouchableOpacity 
            onPress={() => setShowTraitSelector(true)}
            style={styles.addButton}
          >
            <Ionicons name="add" size={16} color="#3B82F6" />
          </TouchableOpacity>
        </View>
        
        <View style={styles.traitsContainer}>
          {userTraits.length > 0 ? (
            userTraits.map((trait) => (
              <TouchableOpacity
                key={trait.id}
                style={[styles.traitChip, { borderColor: trait.color + '40', backgroundColor: trait.color + '10' }]}
                onLongPress={() => removeUserTrait(trait.id)}
              >
                <Text style={styles.traitIcon}>{trait.icon}</Text>
                <Text style={[styles.traitText, { color: trait.color }]}>{trait.trait_name}</Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.placeholderText}>Add personality traits to help others find you</Text>
          )}
        </View>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{activities.length}</Text>
          <Text style={styles.statLabel}>Events Created</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{followersCount}</Text>
          <Text style={styles.statLabel}>Followers</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{followingCount}</Text>
          <Text style={styles.statLabel}>Following</Text>
        </View>
      </View>
    </ScrollView>
  );

  const renderBadgesTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Achievements</Text>
        <View style={styles.badgesContainer}>
          {userBadges.length > 0 ? (
            userBadges.map((badge) => (
              <View key={badge.id} style={[styles.badgeCard, { borderLeftColor: badge.color }]}>
                <View style={styles.badgeHeader}>
                  <View style={[styles.badgeIcon, { backgroundColor: badge.color + '20' }]}>
                    <Text style={styles.badgeIconText}>{badge.icon}</Text>
                  </View>
                  <View style={styles.badgeInfo}>
                    <Text style={styles.badgeName}>{badge.badge_name}</Text>
                    <Text style={styles.badgeType}>{badge.badge_type.replace('_', ' ')}</Text>
                  </View>
                </View>
                <Text style={styles.badgeDescription}>{badge.badge_description}</Text>
                <Text style={styles.badgeDate}>
                  Earned {new Date(badge.earned_at).toLocaleDateString()}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyBadges}>
              <Text style={styles.emptyBadgesIcon}>🏆</Text>
              <Text style={styles.placeholderText}>Participate in activities to earn badges!</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );

  const renderActivitiesTab = () => (
    <ScrollView style={styles.tabContent}>
      <ActivityList
        activities={activities}
        emptyMessage="You haven't created any activities yet."
      />
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2C3E50" />
      <Stack.Screen options={{ 
        title: 'Profile',
        headerShown: false,
      }} />
      
      {/* Header with Gradient */}
      <LinearGradient
        colors={['#2C3E50', '#3498DB']}
        style={styles.headerGradient}
      >
        <ProfileHeader
          name={profile.name}
          username={profile.username}
          avatarUri={profile.avatar_url}
          followersCount={followersCount}
          followingCount={followingCount}
          onEditProfile={handleEditProfile}
        />
      </LinearGradient>

      {/* Tab Navigation */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'profile' && styles.activeTab]}
          onPress={() => setTab('profile')}
        >
          <Ionicons 
            name={tab === 'profile' ? 'person' : 'person-outline'} 
            size={18} 
            color={tab === 'profile' ? '#3B82F6' : '#6B7280'} 
          />
          <Text style={[styles.tabText, tab === 'profile' && styles.activeTabText]}>Profile</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, tab === 'badges' && styles.activeTab]}
          onPress={() => setTab('badges')}
        >
          <Ionicons 
            name={tab === 'badges' ? 'trophy' : 'trophy-outline'} 
            size={18} 
            color={tab === 'badges' ? '#3B82F6' : '#6B7280'} 
          />
          <Text style={[styles.tabText, tab === 'badges' && styles.activeTabText]}>Badges</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, tab === 'activities' && styles.activeTab]}
          onPress={() => setTab('activities')}
        >
          <Ionicons 
            name={tab === 'activities' ? 'calendar' : 'calendar-outline'} 
            size={18} 
            color={tab === 'activities' ? '#3B82F6' : '#6B7280'} 
          />
          <Text style={[styles.tabText, tab === 'activities' && styles.activeTabText]}>Activities</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {tab === 'profile' && renderProfileTab()}
      {tab === 'badges' && renderBadgesTab()}
      {tab === 'activities' && renderActivitiesTab()}

      {/* Trait Selector Modal (simplified for now) */}
      {showTraitSelector && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Personality Traits</Text>
            <ScrollView style={styles.modalScroll}>
              {predefinedTraits
                .filter(trait => !userTraits.some(ut => ut.trait_name === trait.trait_name))
                .map((trait) => (
                <TouchableOpacity
                  key={`${trait.trait_type}-${trait.trait_name}`}
                  style={styles.traitOption}
                  onPress={() => {
                    addUserTrait(trait);
                    setShowTraitSelector(false);
                  }}
                >
                  <Text style={styles.traitIcon}>{trait.icon}</Text>
                  <Text style={styles.traitOptionText}>{trait.trait_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowTraitSelector(false)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerGradient: {
    paddingTop: 50,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  activeTab: {
    backgroundColor: '#EBF4FF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#3B82F6',
  },
  tabContent: {
    flex: 1,
    paddingTop: 16,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EBF4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bioText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#374151',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
  },
  traitsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  traitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  traitIcon: {
    fontSize: 16,
  },
  traitText: {
    fontSize: 14,
    fontWeight: '600',
  },
  placeholderText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  badgesContainer: {
    gap: 12,
  },
  badgeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  badgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  badgeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIconText: {
    fontSize: 20,
  },
  badgeInfo: {
    flex: 1,
  },
  badgeName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 2,
  },
  badgeType: {
    fontSize: 12,
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  badgeDescription: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 8,
  },
  badgeDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  emptyBadges: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyBadgesIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    maxHeight: '70%',
    width: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalScroll: {
    maxHeight: 300,
  },
  traitOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
    gap: 12,
  },
  traitOptionText: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '500',
  },
  modalCloseButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 16,
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
