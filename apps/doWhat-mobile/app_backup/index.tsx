import { Redirect } from 'expo-router';

export default function IndexRedirect() {
  // Land users on the tabbed experience
  return <Redirect href="/(tabs)" />;
}
