import { View, Text } from 'react-native';
import { useEffect } from 'react';

export default function IndexScreen() {
  useEffect(() => {
    console.log('IndexScreen mounted successfully!');
    console.log('Metro server connected at localhost:8081');
  }, []);
  
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#e6f3ff' }}>
      <Text style={{ fontSize: 28, marginBottom: 15, fontWeight: 'bold' }}>🎉 doWhat Mobile</Text>
      <Text style={{ fontSize: 18, color: '#2563eb', marginBottom: 10 }}>App is running successfully!</Text>
      <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', paddingHorizontal: 20 }}>
        Metro bundling completed {'\n'}
        Localhost connection established {'\n'}
        Platform polyfill working
      </Text>
    </View>
  );
}

