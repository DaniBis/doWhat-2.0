import { Stack } from "expo-router";
import * as WebBrowser from 'expo-web-browser';

// Ensure auth session completes on iOS after OAuth redirect
WebBrowser.maybeCompleteAuthSession();

export default function Layout() {
  return (
    <Stack>
      {/* Example: */}
      {/* <Stack.Screen name="index" options={{ title: "Home" }} /> */}
    </Stack>
  );
}
