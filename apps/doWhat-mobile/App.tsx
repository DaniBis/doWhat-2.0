import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';

export default function App() {
  console.log('App component rendering...');
  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>🎉 doWhat Mobile</Text>
        <Text style={styles.subtitle}>Minimal App Test</Text>
        <Text style={styles.description}>
          If you can see this, React Native core is working!
        </Text>
        <Text style={styles.status}>
          ✅ Metro bundler connected{'\n'}
          ✅ JavaScript runtime working{'\n'}
          ✅ Platform polyfill applied
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f8ff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#1e40af',
  },
  subtitle: {
    fontSize: 20,
    marginBottom: 20,
    color: '#374151',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#6b7280',
  },
  status: {
    fontSize: 14,
    textAlign: 'center',
    color: '#059669',
    backgroundColor: '#ecfdf5',
    padding: 15,
    borderRadius: 8,
  },
});
