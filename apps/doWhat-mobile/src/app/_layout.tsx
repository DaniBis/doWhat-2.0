// Work around TS resolution quirks with expo-router types under React 19
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Stack } = require("expo-router");
import '../lib/devtools/disableInspector';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AuthGate from '../components/AuthGate';
import { SavedActivitiesProvider } from '../contexts/SavedActivitiesContext';

export default function Layout() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 60_000,
          },
        },
      }),
  );

  useEffect(() => {
    console.log('Layout component mounted successfully!');
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <SavedActivitiesProvider>
            <AuthGate>
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="add-event" options={{ headerShown: false }} />
                <Stack.Screen name="profile/[id]" options={{ headerShown: false }} />
              </Stack>
            </AuthGate>
          </SavedActivitiesProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
