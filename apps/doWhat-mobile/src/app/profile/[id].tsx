import { useLocalSearchParams, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View, Text, ActivityIndicator, StyleSheet, ScrollView, Image, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../lib/supabase';

interface ProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
  instagram?: string | null;
  whatsapp?: string | null;
}

type ContactAction = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
};

const FALLBACK_AVATAR = 'https://ui-avatars.com/api/?background=0D9488&color=fff&name=';

export default function ViewProfile() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id || typeof id !== 'string') {
        setError('Missing user identifier.');
        setLoading(false);
        return;
      }
      setError(null);
      setLoading(true);
      const baseColumns = ['id', 'full_name', 'avatar_url'];
      const optionalColumns: Array<keyof ProfileRow> = ['bio', 'instagram', 'whatsapp'];
      let activeColumns = [...baseColumns, ...optionalColumns];
      let fetched: ProfileRow | null = null;
      let lastError: string | null = null;

      for (let attempt = 0; attempt < optionalColumns.length + 1; attempt += 1) {
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select(activeColumns.join(', '))
          .eq('id', id)
          .maybeSingle<ProfileRow>();

        if (fetchError) {
          lastError = fetchError.message || 'Failed to load profile';
          const message = fetchError.message?.toLowerCase?.() ?? '';
          const missingColumn = optionalColumns.find((col) => message.includes(col));
          if (missingColumn) {
            activeColumns = activeColumns.filter((col) => col !== missingColumn);
            continue; // retry without the missing optional column
          }
        } else {
          fetched = data ?? null;
          lastError = null;
          break;
        }
      }

      if (cancelled) return;

      if (fetched) {
        setProfile({
          ...fetched,
          bio: 'bio' in fetched ? fetched.bio ?? null : null,
          instagram: 'instagram' in fetched ? fetched.instagram ?? null : null,
          whatsapp: 'whatsapp' in fetched ? fetched.whatsapp ?? null : null,
        });
        setError(null);
      } else if (lastError) {
        setError(lastError);
        setProfile(null);
      } else {
        setError('Profile not found');
        setProfile(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const contactActions = useMemo<ContactAction[]>(() => {
    if (!profile) return [];
    const actions: ContactAction[] = [];
    if (profile.instagram) {
      actions.push({
        icon: 'logo-instagram',
        label: 'View Instagram',
        onPress: () => {
          const handle = profile.instagram!.replace(/^@/, '');
          const url = `https://instagram.com/${handle}`;
          Linking.openURL(url).catch(() => Alert.alert('Unable to open Instagram', 'Please try again later.'));
        },
      });
    }
    if (profile.whatsapp) {
      actions.push({
        icon: 'logo-whatsapp',
        label: 'Message on WhatsApp',
        onPress: () => {
          const digits = profile.whatsapp!.replace(/[^0-9+]/g, '');
          const url = `https://wa.me/${digits}`;
          Linking.openURL(url).catch(() => Alert.alert('Unable to open WhatsApp', 'Please try again later.'));
        },
      });
    }
    return actions;
  }, [profile]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, []);

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={goBack} accessibilityRole="button" accessibilityLabel="Go back" style={styles.backButton}>
        <Ionicons name="arrow-back" size={22} color="#111827" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Profile</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  const renderBody = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0d9488" />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }
    if (!profile) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Profile unavailable.</Text>
        </View>
      );
    }

    const displayName = profile.full_name?.trim() || 'Anonymous Explorer';
    const avatarSource = profile.avatar_url ? { uri: profile.avatar_url } : { uri: `${FALLBACK_AVATAR}${encodeURIComponent(displayName)}` };

    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarWrapper}>
          <Image source={avatarSource} style={styles.avatar} />
        </View>
        <Text style={styles.name}>{displayName}</Text>
        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : <Text style={styles.bioPlaceholder}>This explorer hasn’t added a bio yet.</Text>}

        {contactActions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Connect</Text>
            <View style={styles.actionsRow}>
              {contactActions.map((action) => (
                <TouchableOpacity key={action.label} style={styles.actionChip} onPress={action.onPress}>
                  <Ionicons name={action.icon} size={16} color="#047857" />
                  <Text style={styles.actionLabel}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {renderHeader()}
      {renderBody()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 6,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  headerSpacer: {
    width: 28,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 16,
    textAlign: 'center',
  },
  content: {
    padding: 20,
    alignItems: 'center',
  },
  avatarWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    backgroundColor: '#ECFEFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  bio: {
    fontSize: 16,
    color: '#1F2937',
    textAlign: 'center',
    lineHeight: 22,
  },
  bioPlaceholder: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  section: {
    width: '100%',
    marginTop: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(4,120,87,0.1)',
  },
  actionLabel: {
    marginLeft: 8,
    color: '#065F46',
    fontWeight: '600',
  },
});
