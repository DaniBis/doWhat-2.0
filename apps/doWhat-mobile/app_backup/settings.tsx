import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

type SettingsOption = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  type: 'toggle' | 'navigation' | 'action';
  value?: boolean;
  onPress?: () => void;
  onToggle?: (value: boolean) => void;
  destructive?: boolean;
};

export default function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('expo_push_token, location_enabled')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;
      
      if (data) {
        setNotificationsEnabled(!!data.expo_push_token);
        setLocationEnabled(data.location_enabled ?? true);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut();
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action cannot be undone. All your data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // In a real app, implement account deletion
            Alert.alert('Not implemented', 'Account deletion is not yet implemented.');
          },
        },
      ]
    );
  };

  const settingsOptions: SettingsOption[] = [
    {
      icon: 'analytics',
      title: 'App Status',
      subtitle: 'View feature completion and app overview',
      type: 'navigation',
      onPress: () => router.push('/app-status'),
    },
    {
      icon: 'notifications',
      title: 'Push Notifications',
      subtitle: 'Get notified about new activities nearby',
      type: 'toggle',
      value: notificationsEnabled,
      onToggle: setNotificationsEnabled,
    },
    {
      icon: 'location',
      title: 'Location Services',
      subtitle: 'Allow app to access your location',
      type: 'toggle',
      value: locationEnabled,
      onToggle: setLocationEnabled,
    },
    {
      icon: 'person',
      title: 'Edit Profile',
      subtitle: 'Update your name, photo, and bio',
      type: 'navigation',
      onPress: () => {
        Alert.alert('Not implemented', 'Edit profile is not yet implemented.');
      },
    },
    {
      icon: 'shield-checkmark',
      title: 'Privacy & Security',
      subtitle: 'Manage your privacy settings',
      type: 'navigation',
      onPress: () => {
        Alert.alert('Not implemented', 'Privacy settings are not yet implemented.');
      },
    },
    {
      icon: 'help-circle',
      title: 'Help & Support',
      subtitle: 'Get help or contact support',
      type: 'navigation',
      onPress: () => {
        Alert.alert('Not implemented', 'Help & support is not yet implemented.');
      },
    },
    {
      icon: 'information-circle',
      title: 'About',
      subtitle: 'App version and legal information',
      type: 'navigation',
      onPress: () => router.push('/about'),
    },
    {
      icon: 'log-out',
      title: 'Sign Out',
      type: 'action',
      onPress: handleSignOut,
    },
    {
      icon: 'trash',
      title: 'Delete Account',
      subtitle: 'Permanently delete your account and data',
      type: 'action',
      destructive: true,
      onPress: handleDeleteAccount,
    },
  ];

  const renderSettingsOption = (option: SettingsOption, index: number) => {
    return (
      <TouchableOpacity
        key={index}
        style={[
          styles.optionContainer,
          option.destructive && styles.destructiveOption,
        ]}
        onPress={option.onPress}
        disabled={option.type === 'toggle'}
      >
        <View style={styles.optionLeft}>
          <View style={[
            styles.iconContainer,
            option.destructive && styles.destructiveIconContainer,
          ]}>
            <Ionicons
              name={option.icon}
              size={20}
              color={option.destructive ? '#EF4444' : '#2C7BF6'}
            />
          </View>
          
          <View style={styles.optionText}>
            <Text style={[
              styles.optionTitle,
              option.destructive && styles.destructiveText,
            ]}>
              {option.title}
            </Text>
            {option.subtitle && (
              <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
            )}
          </View>
        </View>

        {option.type === 'toggle' && (
          <Switch
            value={option.value}
            onValueChange={option.onToggle}
            trackColor={{ false: '#D1D5DB', true: '#2C7BF6' }}
            thumbColor="white"
          />
        )}

        {option.type === 'navigation' && (
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Settings',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: 'white' },
        }}
      />

      <ScrollView style={styles.scrollView}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          {settingsOptions.slice(0, 2).map((option, index) => 
            renderSettingsOption(option, index)
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          {settingsOptions.slice(2, 6).map((option, index) => 
            renderSettingsOption(option, index + 2)
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          {settingsOptions.slice(6).map((option, index) => 
            renderSettingsOption(option, index + 6)
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>doWhat v1.0.0</Text>
          <Text style={styles.footerSubtext}>Built with ❤️ for community building</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    backgroundColor: 'white',
    marginTop: 20,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  optionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  destructiveOption: {
    // No special styling needed for container
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EBF4FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  destructiveIconContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  destructiveText: {
    color: '#EF4444',
  },
  optionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  footerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  footerSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
});
