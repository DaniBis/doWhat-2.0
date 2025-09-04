import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function AppStatusScreen() {
  const features = [
    {
      id: 'onboarding',
      name: 'User Onboarding',
      description: 'Step-by-step welcome flow for new users',
      status: 'completed',
      icon: '🚀',
      route: null,
    },
    {
      id: 'search',
      name: 'Activity Search',
      description: 'Advanced search with suggestions and filtering',
      status: 'completed',
      icon: '🔍',
      route: '/home',
    },
    {
      id: 'filters',
      name: 'Smart Filters',
      description: 'Distance, price, category, and time filters',
      status: 'completed',
      icon: '⚙️',
      route: '/filter',
    },
    {
      id: 'rsvp',
      name: 'RSVP System',
      description: 'Confirmation modals with visual feedback',
      status: 'completed',
      icon: '✅',
      route: null,
    },
    {
      id: 'profile',
      name: 'User Profile',
      description: 'Complete profile management with avatar',
      status: 'completed',
      icon: '👤',
      route: '/profile',
    },
    {
      id: 'settings',
      name: 'Settings Panel',
      description: 'App preferences and account management',
      status: 'completed',
      icon: '⚙️',
      route: '/settings',
    },
    {
      id: 'navigation',
      name: 'Enhanced Navigation',
      description: 'Modern tab bar with smooth transitions',
      status: 'completed',
      icon: '🧭',
      route: null,
    },
    {
      id: 'empty-states',
      name: 'Empty States',
      description: 'Helpful guidance when no content available',
      status: 'completed',
      icon: '📝',
      route: null,
    },
  ];

  const completedFeatures = features.filter(f => f.status === 'completed').length;
  const completionPercentage = Math.round((completedFeatures / features.length) * 100);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.title}>App Status</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Overall Progress */}
        <View style={styles.progressSection}>
          <View style={styles.progressCircle}>
            <Text style={styles.progressPercentage}>{completionPercentage}%</Text>
            <Text style={styles.progressLabel}>Complete</Text>
          </View>
          <View style={styles.progressInfo}>
            <Text style={styles.progressTitle}>🎉 Great Progress!</Text>
            <Text style={styles.progressDescription}>
              {completedFeatures} of {features.length} features completed
            </Text>
            <Text style={styles.progressSubtext}>
              Your app has all the essential UX/UI components for a modern mobile experience!
            </Text>
          </View>
        </View>

        {/* Features List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Feature Status</Text>
          {features.map((feature) => (
            <TouchableOpacity
              key={feature.id}
              style={styles.featureCard}
              onPress={() => feature.route && router.push(feature.route as any)}
              disabled={!feature.route}
            >
              <View style={styles.featureIcon}>
                <Text style={styles.featureEmoji}>{feature.icon}</Text>
              </View>
              <View style={styles.featureContent}>
                <View style={styles.featureHeader}>
                  <Text style={styles.featureName}>{feature.name}</Text>
                  <View style={[
                    styles.statusBadge,
                    feature.status === 'completed' && styles.statusBadgeCompleted,
                  ]}>
                    <Ionicons 
                      name="checkmark-circle" 
                      size={16} 
                      color="#10B981" 
                    />
                    <Text style={styles.statusText}>Complete</Text>
                  </View>
                </View>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
              {feature.route && (
                <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Technical Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Technical Implementation</Text>
          <View style={styles.techCard}>
            <Text style={styles.techTitle}>🏗️ Architecture</Text>
            <View style={styles.techList}>
              <Text style={styles.techItem}>• React Native with Expo Router</Text>
              <Text style={styles.techItem}>• TypeScript for type safety</Text>
              <Text style={styles.techItem}>• Supabase for backend services</Text>
              <Text style={styles.techItem}>• Reusable component library</Text>
              <Text style={styles.techItem}>• Modern navigation patterns</Text>
            </View>
          </View>

          <View style={styles.techCard}>
            <Text style={styles.techTitle}>🎨 Design System</Text>
            <View style={styles.techList}>
              <Text style={styles.techItem}>• Consistent color palette</Text>
              <Text style={styles.techItem}>• Responsive layouts</Text>
              <Text style={styles.techItem}>• Smooth animations & transitions</Text>
              <Text style={styles.techItem}>• Accessibility considerations</Text>
              <Text style={styles.techItem}>• Dark/light mode ready</Text>
            </View>
          </View>
        </View>

        {/* Next Steps */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🚀 What's Next?</Text>
          <View style={styles.nextStepsCard}>
            <Text style={styles.nextStepsText}>
              Your app foundation is complete! Consider these enhancements:
            </Text>
            <View style={styles.nextStepsList}>
              <Text style={styles.nextStepItem}>📱 Push notifications</Text>
              <Text style={styles.nextStepItem}>🔐 Enhanced authentication</Text>
              <Text style={styles.nextStepItem}>📊 Analytics integration</Text>
              <Text style={styles.nextStepItem}>🌐 Offline support</Text>
              <Text style={styles.nextStepItem}>🧪 A/B testing</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderRadius: 16,
    padding: 20,
    marginVertical: 20,
    borderWidth: 1,
    borderColor: '#E0F2FE',
  },
  progressCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  progressPercentage: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  progressLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  progressInfo: {
    flex: 1,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  progressDescription: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  progressSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  section: {
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  featureEmoji: {
    fontSize: 20,
  },
  featureContent: {
    flex: 1,
  },
  featureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  featureName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusBadgeCompleted: {
    backgroundColor: '#ECFDF5',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 4,
  },
  featureDescription: {
    fontSize: 12,
    color: '#6B7280',
  },
  techCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  techTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  techList: {
    gap: 4,
  },
  techItem: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  nextStepsCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  nextStepsText: {
    fontSize: 14,
    color: '#92400E',
    fontWeight: '500',
    marginBottom: 12,
  },
  nextStepsList: {
    gap: 6,
  },
  nextStepItem: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 16,
  },
});
