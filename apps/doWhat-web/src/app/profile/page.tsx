"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/browser";

export default function ProfilePage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [bio, setBio] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [stats, setStats] = useState<{
    eventsCreated: number;
    eventsAttended: number;
    totalRsvps: number;
  }>({ eventsCreated: 0, eventsAttended: 0, totalRsvps: 0 });

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      const em = auth?.user?.email ?? null;
      setEmail(em);
      if (!uid) return;

      // Get profile data
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, bio, location")
        .eq("id", uid)
        .maybeSingle();
      if (!error && data) {
        setFullName((data?.full_name as string) || "");
        setAvatarUrl((data?.avatar_url as string) || "");
        setBio((data?.bio as string) || "");
        setLocation((data?.location as string) || "");
      }

      // Get user stats
      const [eventsCreated, eventsAttended, totalRsvps] = await Promise.all([
        supabase.from("sessions").select("id", { count: "exact", head: true }).eq("created_by", uid),
        supabase.from("rsvps").select("session_id", { count: "exact", head: true }).eq("user_id", uid).eq("status", "going"),
        supabase.from("rsvps").select("id", { count: "exact", head: true }).eq("user_id", uid),
      ]);

      setStats({
        eventsCreated: eventsCreated.count ?? 0,
        eventsAttended: eventsAttended.count ?? 0,
        totalRsvps: totalRsvps.count ?? 0,
      });
    })();
  }, []);

  async function save() {
    try {
      setErr("");
      setMsg("");
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("Please sign in first.");
      
      const upsert = {
        id: uid,
        full_name: fullName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        bio: bio.trim() || null,
        location: location.trim() || null,
        updated_at: new Date().toISOString(),
      };
      
      const { error } = await supabase.from("profiles").upsert(upsert, { onConflict: "id" });
      if (error) throw error;
      setMsg("Profile saved successfully!");
    } catch (e: any) {
      setErr(e.message ?? "Failed to save profile");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-brand-teal hover:underline">← Back</Link>
          <h1 className="text-2xl font-bold">My Profile</h1>
        </div>
        {email && (
          <button
            onClick={signOut}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Sign Out
          </button>
        )}
      </div>

      {!email && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-yellow-800">
          <h3 className="font-semibold mb-2">Not signed in</h3>
          <p>Please sign in to view and edit your profile.</p>
        </div>
      )}

      {email && (
        <>
          {/* Profile Stats */}
          <div className="mb-8 grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-gradient-to-r from-teal-50 to-teal-100 p-4 text-center">
              <div className="text-2xl font-bold text-teal-700">{stats.eventsCreated}</div>
              <div className="text-sm text-teal-600">Events Created</div>
            </div>
            <div className="rounded-lg bg-gradient-to-r from-blue-50 to-blue-100 p-4 text-center">
              <div className="text-2xl font-bold text-blue-700">{stats.eventsAttended}</div>
              <div className="text-sm text-blue-600">Events Attended</div>
            </div>
            <div className="rounded-lg bg-gradient-to-r from-purple-50 to-purple-100 p-4 text-center">
              <div className="text-2xl font-bold text-purple-700">{stats.totalRsvps}</div>
              <div className="text-sm text-purple-600">Total RSVPs</div>
            </div>
          </div>

          {err && (
            <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-700 border border-red-200">
              {err}
            </div>
          )}
          {msg && (
            <div className="mb-4 rounded-lg bg-green-50 p-4 text-green-700 border border-green-200">
              {msg}
            </div>
          )}

          {/* Profile Form */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-6 text-lg font-semibold">Profile Information</h2>
            
            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Email</label>
                <input 
                  value={email ?? ""} 
                  readOnly 
                  className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500" 
                />
              </div>
              
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Full Name</label>
                <input 
                  value={fullName} 
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal" 
                />
              </div>
              
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Bio</label>
                <textarea 
                  value={bio} 
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell others about yourself..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal" 
                />
              </div>
              
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Location</label>
                <input 
                  value={location} 
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City, Country"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal" 
                />
              </div>
              
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Avatar URL</label>
                <input 
                  value={avatarUrl} 
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/your-photo.jpg"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal" 
                />
                {avatarUrl && (
                  <div className="mt-2">
                    <img 
                      src={avatarUrl} 
                      alt="Avatar preview" 
                      className="h-16 w-16 rounded-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>
              
              <div className="flex gap-3">
                <button 
                  onClick={save} 
                  disabled={loading}
                  className="rounded-lg bg-brand-teal px-6 py-2 text-white font-medium hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-brand-teal focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Saving..." : "Save Changes"}
                </button>
                
                <Link 
                  href="/my/rsvps"
                  className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  View My RSVPs
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

