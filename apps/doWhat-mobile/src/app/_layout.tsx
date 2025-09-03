import { Stack } from "expo-router";
import * as WebBrowser from 'expo-web-browser';
// Register background location task early in app lifecycle
import '../lib/bg-location';
import * as Notifications from 'expo-notifications';

// Ensure auth session completes on iOS after OAuth redirect
WebBrowser.maybeCompleteAuthSession();

// Set a basic notifications handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sessions/[id]" options={{ title: 'Session' }} />
      <Stack.Screen name="activities/[id]" options={{ title: 'Activity' }} />
      <Stack.Screen name="add-event" options={{ title: 'Add event' }} />
    </Stack>
  );
}
