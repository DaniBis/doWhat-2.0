import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { theme } from '@dowhat/shared';

export type FindA4thHeroSession = {
  id: string;
  sportLabel?: string | null;
  venueLabel?: string | null;
  startsAt?: string | Date | null;
  openSlots?: number | null;
};

export type FindA4thHeroProps = {
  sessions?: FindA4thHeroSession[] | null;
  onPress?: (session: FindA4thHeroSession) => void;
  title?: string;
  subtitle?: string;
};

const formatStartsAt = (value: string | Date | null | undefined): string => {
  if (!value) return 'Starts soon';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'Starts soon';
  const now = Date.now();
  const diffMinutes = Math.round((date.getTime() - now) / (1000 * 60));
  if (diffMinutes < 1) return 'Starting now';
  if (diffMinutes < 60) return `Starts in ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Starts in ${diffHours} h`;
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatSlotsLabel = (slots?: number | null): string => {
  if (typeof slots !== 'number' || Number.isNaN(slots) || slots <= 1) {
    return 'Needs 1 player';
  }
  return `Needs ${slots} players`;
};

const CARD_WIDTH = 260;

const FindA4thHero = ({
  sessions,
  onPress,
  title = 'Find a 4th',
  subtitle = 'Join nearby sessions that still need players',
}: FindA4thHeroProps) => {
  const listData = useMemo(() => (Array.isArray(sessions) ? sessions.filter(Boolean) : []), [sessions]);

  if (listData.length === 0) {
    return null;
  }

  return (
    <View testID="find-a-4th-hero" style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <FlatList
        horizontal
        data={listData}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const startsIn = formatStartsAt(item.startsAt ?? null);
          const slotsLabel = formatSlotsLabel(item.openSlots ?? null);
          const venueLabel = item.venueLabel?.trim();
          const sportLabel = item.sportLabel?.trim() || 'Session';
          return (
            <Link href={`/(tabs)/sessions/${item.id}`} asChild>
              <Pressable
                accessibilityRole="button"
                style={styles.card}
                onPress={() => {
                  if (typeof onPress === 'function') {
                    onPress(item);
                  }
                }}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {sportLabel}
                  </Text>
                  {venueLabel ? (
                    <Text style={styles.cardSubtitle} numberOfLines={1}>
                      {venueLabel}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.metaRow}>
                  <View style={styles.metaPill}>
                    <Text style={styles.metaText}>{startsIn}</Text>
                  </View>
                  <View style={styles.slotsPill}>
                    <Text style={styles.slotsText}>{slotsLabel}</Text>
                  </View>
                </View>
              </Pressable>
            </Link>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  header: {
    paddingHorizontal: 20,
    gap: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.brandInk,
  },
  subtitle: {
    color: theme.colors.ink60,
  },
  list: {
    paddingHorizontal: 20,
    gap: 16,
    paddingBottom: 6,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    gap: 12,
  },
  cardHeader: {
    gap: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.brandInk,
  },
  cardSubtitle: {
    color: theme.colors.ink60,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceAlt,
  },
  metaText: {
    color: theme.colors.ink60,
    fontWeight: '600',
    fontSize: 12,
  },
  slotsPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  slotsText: {
    color: theme.colors.success,
    fontWeight: '700',
    fontSize: 12,
  },
});

export default FindA4thHero;
