// Work around TS resolution quirks with expo-router types under React 19
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Stack } = require("expo-router");

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
