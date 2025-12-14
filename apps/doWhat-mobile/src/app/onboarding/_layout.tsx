// Work around TS resolution quirks with expo-router types under React 19
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Stack } = require('expo-router');

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
