// e.g. src/components/SignInButton.tsx
"use client";

import { supabase } from "@/lib/supabase/browser";


export default function SignInButton() {
  return (
    <button
      onClick={async () => {
        await supabase.auth.signInWithOAuth({
          provider: "google", // or 'github', etc.
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        });
      }}
    >
      Sign in with Google
    </button>
  );
}
