import { View, Image, Text } from 'react-native';
import { theme } from '@dowhat/shared';

export default function Brand({ size = 36 }: { size?: number }) {
  const site = process.env.EXPO_PUBLIC_WEB_URL;
  const uri = site ? `${site.replace(/\/$/, '')}/logo.png` : undefined;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
      ) : (
        <View style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.colors.brandYellow,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Text style={{ fontSize: size * 0.5 }}>📍</Text>
        </View>
      )}
      <Text style={{ fontSize: 18, fontWeight: '800', color: 'white' }}>doWhat</Text>
    </View>
  );
}
