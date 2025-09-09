import { View, Image, Text } from 'react-native';
import { theme } from '@dowhat/shared/src/theme';

export default function Brand({ size = 36 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {/* Try to load logo asset if present; else render a simple circle */}
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
      <Text style={{ fontSize: 18, fontWeight: '800', color: 'white' }}>doWhat</Text>
    </View>
  );
}

