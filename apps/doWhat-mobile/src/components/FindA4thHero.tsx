import React, { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';

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
    <View testID="find-a-4th-hero" style={{ gap: 12 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#0F172A' }}>{title}</Text>
        {subtitle ? (
          <Text style={{ color: '#475569', marginTop: 4 }}>{subtitle}</Text>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={listData}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}
        renderItem={({ item }) => {
          const startsIn = formatStartsAt(item.startsAt ?? null);
          const slotsLabel = formatSlotsLabel(item.openSlots ?? null);
          const venueLabel = item.venueLabel || 'Venue TBD';
          const sportLabel = item.sportLabel || 'Open session';
          return (
            <Link href={`/(tabs)/sessions/${item.id}`} asChild>
              <Pressable
                accessibilityRole="button"
                style={{
                  width: CARD_WIDTH,
                  borderRadius: 20,
                  backgroundColor: '#FFFFFF',
                  padding: 18,
                  shadowColor: '#000',
                  shadowOpacity: 0.08,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 3,
                  gap: 10,
                }}
                onPress={() => {
                  if (typeof onPress === 'function') {
                    onPress(item);
                  }
                }}
              >
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#0F172A' }} numberOfLines={1}>
                    {sportLabel}
                  </Text>
                  <Text style={{ color: '#475569' }} numberOfLines={1}>
                    {venueLabel}
                  </Text>
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={{ color: '#0F172A', fontWeight: '600' }}>{startsIn}</Text>
                  <Text style={{ color: '#059669', fontWeight: '600' }}>{slotsLabel}</Text>
                </View>
              </Pressable>
            </Link>
          );
        }}
      />
    </View>
  );
};

export default FindA4thHero;
