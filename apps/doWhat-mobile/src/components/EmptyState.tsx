import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
// Try to load Ionicons at runtime. In Jest tests, prefer a simple fallback to avoid native deps.
const IS_TEST = typeof process !== 'undefined' && !!process.env?.JEST_WORKER_ID;
let Ionicons: any = null;
if (!IS_TEST) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Ionicons = require('@expo/vector-icons').Ionicons;
  } catch {
    Ionicons = null;
  }
}
import { router } from 'expo-router';

type EmptyStateProps = {
  icon: string;
  title: string;
  subtitle: string;
  actionText?: string;
  onAction?: () => void;
  actionRoute?: string;
};

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  subtitle,
  actionText,
  onAction,
  actionRoute,
}) => {
  const handleAction = () => {
    if (onAction) {
      onAction();
    } else if (actionRoute) {
      router.push(actionRoute as any);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        {Ionicons && (typeof Ionicons === 'function' || typeof Ionicons?.render === 'function') ? (
          <Ionicons name={icon as any} size={64} color="#D1D5DB" />
        ) : (
          <Text style={{ fontSize: 48, color: '#D1D5DB' }}>📭</Text>
        )}
      </View>
      
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      
      {actionText && (
        <TouchableOpacity style={styles.actionButton} onPress={handleAction}>
          <Text style={styles.actionText} onPress={handleAction}>{actionText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    paddingTop: 60,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  actionButton: {
    backgroundColor: '#2C7BF6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#2C7BF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  actionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default EmptyState;
