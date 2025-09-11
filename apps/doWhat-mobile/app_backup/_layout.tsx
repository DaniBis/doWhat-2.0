import { Stack } from "expo-router";
import { Platform } from 'react-native';
import { useEffect } from 'react';

// Simple reactNativeVersion polyfill
if (!(Platform as any).reactNativeVersion) {
  (Platform as any).reactNativeVersion = '0.79.5';
  console.log('Platform polyfill applied');
}

export default function Layout() {
  useEffect(() => {
    console.log('Layout component mounted successfully!');
  }, []);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
