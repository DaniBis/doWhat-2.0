import { ExpoRoot } from 'expo-router';

export default function App() {
  const context = require.context('./apps/doWhat-mobile/src/app', true, /.*/);
  return <ExpoRoot context={context} />;
}
