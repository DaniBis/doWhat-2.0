import { View, Image, Text } from 'react-native';
import { theme } from '@dowhat/shared';

type BrandProps = {
  size?: number;
  tone?: 'light' | 'dark';
};

export default function Brand({ size = 36, tone = 'light' }: BrandProps) {
  const site = process.env.EXPO_PUBLIC_WEB_URL;
  const uri = site ? `${site.replace(/\/$/, '')}/logo.png` : undefined;
  const textColor = tone === 'light' ? '#FFFFFF' : theme.colors.brandInk;
  const badgeBg = tone === 'light' ? 'rgba(255,255,255,0.2)' : theme.colors.brandYellow;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
      ) : (
        <View style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: badgeBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Text style={{ fontSize: size * 0.5 }}>{tone === 'light' ? '✨' : '📍'}</Text>
        </View>
      )}
      <View>
        <Text style={{ fontSize: 18, fontWeight: '800', color: textColor }}>doWhat</Text>
        <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 2.2, textTransform: 'uppercase', color: tone === 'light' ? 'rgba(255,255,255,0.7)' : theme.colors.ink40 }}>
          Discover
        </Text>
      </View>
    </View>
  );
}
