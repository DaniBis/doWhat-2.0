import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { resolvePlaceBranding } from '@dowhat/shared';

import { buildWebUrl } from '../lib/web';

type Props = {
  name?: string | null;
  website?: string | null;
  size?: number;
};

export default function PlaceBrandMark({ name, website, size = 48 }: Props) {
  const [logoState, setLogoState] = useState<'primary' | 'fallback' | 'failed'>('primary');
  const logoProxyBaseUrl = useMemo(() => {
    try {
      return buildWebUrl('/api/place-logo');
    } catch {
      return null;
    }
  }, []);
  const branding = useMemo(
    () => resolvePlaceBranding({ name, website, logoProxyBaseUrl }),
    [logoProxyBaseUrl, name, website],
  );
  const activeLogoUrl =
    logoState === 'primary'
      ? branding.logoUrl
      : logoState === 'fallback'
        ? branding.fallbackLogoUrl
        : null;

  useEffect(() => {
    setLogoState('primary');
  }, [branding.logoUrl, branding.fallbackLogoUrl]);

  if (activeLogoUrl) {
    return (
      <View style={[styles.frame, { width: size, height: size, borderRadius: Math.max(14, size / 3.2) }]}>
        <Image
          source={{ uri: activeLogoUrl }}
          style={styles.image}
          resizeMode="cover"
          accessibilityLabel={name ? `${name} logo` : 'Place logo'}
          onError={() => {
            setLogoState((current) => {
              if (
                current === 'primary'
                && branding.fallbackLogoUrl
                && branding.fallbackLogoUrl !== branding.logoUrl
              ) {
                return 'fallback';
              }
              return 'failed';
            });
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: Math.max(14, size / 3.2) }]}>
      <Text style={[styles.initials, { fontSize: Math.max(13, Math.round(size * 0.28)) }]}>
        {branding.initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  initials: {
    fontWeight: '700',
    color: '#0369A1',
  },
});
