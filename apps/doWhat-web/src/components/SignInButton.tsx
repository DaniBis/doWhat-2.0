// e.g. src/components/SignInButton.tsx
"use client";

import { supabase } from "../lib/supabase/browser";
import { buildAuthCallbackUrl } from "../lib/authRedirects";


export default function SignInButton() {
  return (
    <button
      onClick={async () => {
        await supabase.auth.signInWithOAuth({
          provider: "google", // or 'github', etc.
          options: {
            redirectTo: buildAuthCallbackUrl(window.location.origin),
          },
        });
      }}
    >
      Sign in with Google
    </button>
  );
}
