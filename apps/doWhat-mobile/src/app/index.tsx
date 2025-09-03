import { Redirect } from 'expo-router';

export default function IndexRedirect() {
  // Redirect to the Tabs group index explicitly
  return <Redirect href="/(tabs)/index" />;
}
