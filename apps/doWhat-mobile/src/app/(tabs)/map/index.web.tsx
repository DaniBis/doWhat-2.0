import { useMemo } from 'react';
import { Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { CITY_SWITCHER_ENABLED, DEFAULT_CITY_SLUG, getCityConfig, listCities } from '@dowhat/shared';

import { buildWebUrl } from '../../../lib/web';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 18,
  },
  heading: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '800',
  },
  lead: {
    color: '#cbd5e1',
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    gap: 10,
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  cityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cityTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
  },
  cityText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#14b8a6',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#042f2e',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default function MapTabWebFallback() {
  const router = useRouter();

  const cities = useMemo(() => {
    if (!CITY_SWITCHER_ENABLED) return [getCityConfig(DEFAULT_CITY_SLUG)];
    return listCities();
  }, []);

  const openFullMap = async () => {
    const url = buildWebUrl('/map');
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      router.push('/(tabs)/discover');
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Map on web</Text>
        <Text style={styles.lead}>
          The native map canvas is available on iOS and Android. Use the full doWhat web map to browse live
          activities and venues in browser mode.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Available cities</Text>
          <View style={styles.cityRow}>
            {cities.map((city) => (
              <View key={city.slug} style={styles.cityTag}>
                <Text style={styles.cityText}>{city.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <Pressable onPress={openFullMap} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Open full map</Text>
        </Pressable>

        <Pressable onPress={() => router.push('/(tabs)/discover')} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Back to discovery</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
