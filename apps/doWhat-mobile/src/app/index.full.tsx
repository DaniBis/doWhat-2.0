import React from 'react';
import { Redirect } from 'expo-router';
// Ensure Supabase client is initialized early (and placate stale TS references)

// Root entry: decide what the base URL (doWhat:// or /) should show.
// Currently we always send users to the tabbed home screen.
// (You could later branch to onboarding if no session, etc.)
export default function RootIndex() {
  // NOTE: We keep this minimal to avoid a visible flash. If you want
  // conditional logic based on auth, you could do:
  // const [ready, setReady] = React.useState(false); const [signedIn, setSignedIn] = React.useState(false);
  // useEffect(()=>{ supabase.auth.getSession().then(({data})=>{ setSignedIn(!!data.session); setReady(true); }); }, []);
  // if (!ready) return null; return <Redirect href={signedIn ? '/(tabs)/home' : '/(tabs)/home'} />;
  return <Redirect href="/test" />;
}
