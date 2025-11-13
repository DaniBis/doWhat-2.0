import { View, Text } from 'react-native';

export default function TestScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ff0000' }}>
      <Text style={{ fontSize: 24, color: 'white' }}>🎉 doWhat App Is Working!</Text>
      <Text style={{ fontSize: 16, color: 'white', marginTop: 10 }}>
        If you can see this, the app is running successfully!
      </Text>
    </View>
  );
}
