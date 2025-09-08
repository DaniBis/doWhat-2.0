import { Redirect } from 'expo-router';

export default function IndexRedirect() {
  // Redirect to the home page
  return <Redirect href="/home" />;
}
