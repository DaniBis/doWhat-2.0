"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { supabase } from "@/lib/supabase/browser";

export default function AuthButtons() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const EmailAuth = dynamic(() => import("@/components/EmailAuth"), { ssr: false });

  useEffect(() => {
    let mounted = true;
    
    const getUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (mounted) {
          setUser(data.user);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error getting user:', error);
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      }
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (mounted) {
        setUser(session?.user ?? null);
        setLoading(false);
        
        if (event === 'SIGNED_IN') {
          setSigningIn(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignIn = async () => {
    try {
      setSigningIn(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { 
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        },
      });
      
      if (error) {
        console.error('Sign in error:', error);
        setSigningIn(false);
      }
    } catch (error) {
      console.error('Sign in error:', error);
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="text-gray-500 text-sm">
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSignIn}
            disabled={signingIn}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-500 px-4 py-2 text-blue-500 hover:bg-blue-50 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {signingIn ? (
              <>
                <span className="animate-spin">⟳</span>
                Signing in...
              </>
            ) : (
              <>
                <span>🔑</span>
                Sign in with Google
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowEmail((s) => !s)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            aria-expanded={showEmail}
          >
            {showEmail ? "Close" : "More options"}
          </button>
        </div>
        {showEmail && (
          <div className="absolute right-0 z-50 mt-2 w-80">
            <EmailAuth onDone={() => setShowEmail(false)} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-600 text-sm">
        {user.email}
      </span>
      <form action="/auth/signout" method="post">
        <button 
          type="submit" 
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Sign out
        </button>
      </form>
      <Link 
        href="/profile" 
        className="rounded-lg border border-emerald-500 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition-colors"
      >
        Profile
      </Link>
    </div>
  );
}
