import { View, Image, Text } from 'react-native';
import { theme } from '@dowhat/shared';

type BrandProps = {
  size?: number;
  tone?: 'light' | 'dark';
};

export default function Brand({ size = 36, tone = 'light' }: BrandProps) {
  const textColor = tone === 'light' ? '#FFFFFF' : theme.colors.brandInk;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Image
        source={require('../../assets/icon.png')}
        style={{ width: size, height: size, borderRadius: Math.max(12, size * 0.28) }}
        resizeMode="cover"
        accessibilityLabel="doWhat logo"
      />
      <View>
        <Text style={{ fontSize: 18, fontWeight: '800', color: textColor }}>doWhat</Text>
        <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 2.2, textTransform: 'uppercase', color: tone === 'light' ? 'rgba(255,255,255,0.7)' : theme.colors.ink40 }}>
          Discover
        </Text>
      </View>
    </View>
  );
}
