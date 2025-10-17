import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type ProfileHeaderProps = {
  name: string;
  username: string;
  avatarUri?: string | null;
  followersCount: number;
  followingCount: number;
  onEditProfile: () => void;
};

const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  name,
  username,
  avatarUri,
  followersCount,
  followingCount,
  onEditProfile,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.headerTop}>
        <Image
          style={styles.avatar}
          source={avatarUri ? { uri: avatarUri } : require('../../assets/icon.png')}
        />        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{followersCount}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{followingCount}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
        </View>
      </View>
      
      <View style={styles.userInfo}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.username}>@{username}</Text>
      </View>
      
      <TouchableOpacity
        style={styles.editProfileButton}
        onPress={onEditProfile}
      >
        <Text style={styles.editProfileText}>Edit Profile</Text>
      </TouchableOpacity>
      
      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tab, styles.activeTab]}>
          <Ionicons name="calendar-outline" size={22} color="#2C7BF6" />
          <Text style={styles.activeTabText}>My Activities</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    paddingTop: 20,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  statsContainer: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-evenly',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  userInfo: {
    marginBottom: 16,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  username: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  editProfileButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  editProfileText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  tabBar: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginRight: 24,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#2C7BF6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginLeft: 4,
  },
  activeTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2C7BF6',
    marginLeft: 4,
  },
});

export default ProfileHeader;
