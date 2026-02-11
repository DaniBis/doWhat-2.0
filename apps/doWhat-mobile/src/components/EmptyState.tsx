import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { theme } from '@dowhat/shared';

type IconRenderer = React.ComponentType<{ name: string; size: number; color: string }>;

// Try to load Ionicons at runtime. In Jest tests, prefer a simple fallback to avoid native deps.
const IS_TEST = typeof process !== 'undefined' && !!process.env?.JEST_WORKER_ID;
let Ionicons: IconRenderer | null = null;
if (!IS_TEST) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vectorIcons = require('@expo/vector-icons') as { Ionicons?: IconRenderer };
    Ionicons = typeof vectorIcons.Ionicons === 'function' ? vectorIcons.Ionicons : null;
  } catch {
    Ionicons = null;
  }
}

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
      router.push(actionRoute);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <View style={styles.iconContainer}>
          {Ionicons ? (
            <Ionicons name={icon} size={56} color={theme.colors.ink40} />
          ) : (
            <Text style={{ fontSize: 46, color: theme.colors.ink40 }}>📭</Text>
          )}
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {actionText && (
          <TouchableOpacity style={styles.actionButton} onPress={handleAction}>
            <Text style={styles.actionText}>{actionText}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    paddingTop: 40,
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme.colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.brandInk,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: theme.colors.ink60,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  actionButton: {
    backgroundColor: theme.colors.brandTeal,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: theme.colors.brandTeal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  actionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default EmptyState;
