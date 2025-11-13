"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/browser";

export default function AuthButtons() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (mounted) setEmail(data.user?.email ?? null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!email)
    return (
      <button
        type="button"
        onClick={async () => {
          await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: `${location.origin}/auth/callback` },
          });
        }}
        className="rounded border px-2 py-1"
      >
        Sign in
      </button>
    );

  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-600">{email}</span>
      <form action="/auth/signout" method="post">
        <button type="submit" className="rounded border px-2 py-1">
          Sign out
        </button>
      </form>
      <Link href="/profile" className="rounded border px-2 py-1">Profile</Link>
    </div>
  );
}

