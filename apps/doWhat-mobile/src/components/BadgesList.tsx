import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { theme } from '@dowhat/shared';

export type MobileBadgeItem = {
  id?: string;
  badge_id: string;
  status: 'unverified' | 'verified' | 'expired';
  endorsements?: number;
  locked?: boolean;
  badges?: { id: string; name: string; description?: string | null; category?: string } | null;
};

export function BadgesList({ items, threshold = 3, onEndorse }: { items: MobileBadgeItem[]; threshold?: number; onEndorse?: (badge_id: string) => void }) {
  if (!items.length) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ fontSize: 32, marginBottom: 8 }}>🏆</Text>
        <Text style={{ color: theme.colors.ink60 }}>No badges yet.</Text>
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 12 }}>
      {items.map((b) => {
        const locked = b.locked && !b.id;
        const verified = b.status === 'verified';
        const endorsements = b.endorsements ?? 0;
        const remaining = !verified ? Math.max(0, threshold - endorsements) : 0;
        return (
          <View key={b.badge_id} style={{ width: 180, marginRight: 12, backgroundColor: '#fff', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: locked ? '#e5e7eb' : verified ? '#fbbf24' : '#d1d5db' }}>
            <Text style={{ fontSize: 24 }}>{locked ? '🔒' : '🏅'}</Text>
            <Text style={{ fontWeight: '700', marginTop: 4, color: theme.colors.brandInk }} numberOfLines={1}>{b.badges?.name || 'Badge'}</Text>
            <Text style={{ fontSize: 11, color: theme.colors.ink60, marginTop: 2 }}>
              {locked ? 'Locked' : verified ? 'Verified' : 'Unverified'}
              {!locked && !verified && ` · ${endorsements}/${threshold}${remaining>0 ? ` (${remaining} left)` : ''}`}
              {verified && ' · ✅'}
            </Text>
            {!!b.badges?.description && (
              <Text style={{ fontSize: 12, color: theme.colors.ink60, marginTop: 4 }} numberOfLines={3}>{b.badges.description}</Text>
            )}
            {!locked && !verified && onEndorse && (
              <Pressable onPress={()=>onEndorse(b.badge_id)} style={{ marginTop: 8, backgroundColor: theme.colors.brandTeal, paddingVertical: 6, borderRadius: 8 }}>
                <Text style={{ textAlign: 'center', color: 'white', fontSize: 12, fontWeight: '600' }}>Endorse</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
