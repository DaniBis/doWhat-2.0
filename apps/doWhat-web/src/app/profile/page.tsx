"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/browser";

type UserTrait = {
  trait_name: string;
  icon: string;
  color: string;
};

type UserBadge = {
  badge_name: string;
  icon: string;
  color: string;
  earned_at: string;
};

const availableTraits = [
  { trait_name: 'Early Bird', icon: '🌅', color: '#F59E0B' },
  { trait_name: 'Night Owl', icon: '🦉', color: '#7C3AED' },
  { trait_name: 'Social Butterfly', icon: '🦋', color: '#EC4899' },
  { trait_name: 'Adventure Seeker', icon: '🏔️', color: '#059669' },
  { trait_name: 'Fitness Enthusiast', icon: '💪', color: '#DC2626' },
  { trait_name: 'Foodie', icon: '🍕', color: '#EA580C' },
  { trait_name: 'Art Lover', icon: '🎨', color: '#9333EA' },
  { trait_name: 'Music Fan', icon: '🎵', color: '#0EA5E9' },
  { trait_name: 'Tech Geek', icon: '💻', color: '#059669' },
];

const availableBadges = [
  { badge_name: 'Community Builder', icon: '🏗️', color: '#10B981', earned_at: '2024-01-15' },
  { badge_name: 'Event Organizer', icon: '📅', color: '#3B82F6', earned_at: '2024-02-20' },
  { badge_name: 'Social Connector', icon: '🤝', color: '#8B5CF6', earned_at: '2024-03-10' },
  { badge_name: 'Early Adopter', icon: '🚀', color: '#F59E0B', earned_at: '2024-01-01' },
];

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
  const [activeTab, setActiveTab] = useState<'profile' | 'traits' | 'badges' | 'activities'>('profile');
  const [userTraits, setUserTraits] = useState<UserTrait[]>([]);
  const [userBadges, setUserBadges] = useState<UserBadge[]>([]);
  const [showTraitSelector, setShowTraitSelector] = useState(false);
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

      // Load demo traits and badges
      setUserTraits([
        availableTraits[0], // Early Bird
        availableTraits[3], // Adventure Seeker
        availableTraits[6], // Art Lover
      ]);
      setUserBadges(availableBadges);

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

  const addTrait = (trait: UserTrait) => {
    if (!userTraits.find(t => t.trait_name === trait.trait_name)) {
      setUserTraits([...userTraits, trait]);
    }
    setShowTraitSelector(false);
  };

  const removeTrait = (traitName: string) => {
    setUserTraits(userTraits.filter(t => t.trait_name !== traitName));
  };

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

  const renderProfileTab = () => (
    <div className="space-y-6">
      {err && (
        <div className="rounded-lg bg-red-50 p-4 text-red-700 border border-red-200">
          {err}
        </div>
      )}
      {msg && (
        <div className="rounded-lg bg-green-50 p-4 text-green-700 border border-green-200">
          {msg}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Profile Information</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input 
              value={email ?? ""} 
              readOnly 
              className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500" 
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
            <input 
              value={fullName} 
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" 
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Bio</label>
            <textarea 
              value={bio} 
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell others about yourself..."
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" 
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
            <input 
              value={location} 
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, Country"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" 
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Avatar URL</label>
            <input 
              value={avatarUrl} 
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/your-photo.jpg"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" 
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
              className="rounded-lg bg-blue-500 px-6 py-2 text-white font-medium hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
    </div>
  );

  const renderTraitsTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">My Personality Traits</h3>
          <button
            onClick={() => setShowTraitSelector(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            + Add Trait
          </button>
        </div>
        
        {userTraits.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">🏷️</div>
            <p>No traits added yet. Add some to help others find you!</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {userTraits.map((trait) => (
              <div
                key={trait.trait_name}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{trait.icon}</span>
                  <span className="font-medium text-gray-900">{trait.trait_name}</span>
                </div>
                <button
                  onClick={() => removeTrait(trait.trait_name)}
                  className="text-red-500 hover:text-red-700 transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trait Selector Modal */}
      {showTraitSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Add Personality Trait</h3>
            <div className="grid gap-2 max-h-60 overflow-y-auto">
              {availableTraits
                .filter(trait => !userTraits.find(ut => ut.trait_name === trait.trait_name))
                .map((trait) => (
                  <button
                    key={trait.trait_name}
                    onClick={() => addTrait(trait)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 text-left"
                  >
                    <span className="text-2xl">{trait.icon}</span>
                    <span className="font-medium">{trait.trait_name}</span>
                  </button>
                ))}
            </div>
            <button
              onClick={() => setShowTraitSelector(false)}
              className="mt-4 w-full py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderBadgesTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Achievement Badges</h3>
        
        {userBadges.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">🏆</div>
            <p>No badges earned yet. Participate in activities to earn badges!</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {userBadges.map((badge) => (
              <div
                key={badge.badge_name}
                className="flex items-start gap-4 p-4 rounded-lg border border-gray-200 bg-gradient-to-r from-gray-50 to-white"
              >
                <span className="text-3xl">{badge.icon}</span>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{badge.badge_name}</h4>
                  <p className="text-sm text-gray-600">
                    Earned {new Date(badge.earned_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderActivitiesTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">My Activities</h3>
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2">🎯</div>
          <p>Activity history will appear here</p>
          <Link 
            href="/my/rsvps"
            className="inline-block mt-4 text-blue-500 hover:underline"
          >
            View My RSVPs →
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 via-blue-800 to-blue-900 text-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <Link href="/" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
              ← Back
            </Link>
            {email && (
              <button
                onClick={signOut}
                className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
              >
                Sign Out
              </button>
            )}
          </div>

          <div className="text-center">
            <div className="w-20 h-20 bg-white/20 rounded-full mx-auto mb-4 flex items-center justify-center">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="text-2xl">👤</span>
              )}
            </div>
            <h1 className="text-2xl font-bold mb-2">{fullName || email || 'My Profile'}</h1>
            {location && <p className="text-white/80">📍 {location}</p>}
          </div>
        </div>
      </div>

      {!email && (
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-yellow-800">
            <h3 className="font-semibold mb-2">Not signed in</h3>
            <p>Please sign in to view and edit your profile.</p>
          </div>
        </div>
      )}

      {email && (
        <div className="max-w-4xl mx-auto px-4 py-8">
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

          {/* Navigation Tabs */}
          <div className="flex space-x-1 mb-6 bg-gray-200 p-1 rounded-lg">
            {[
              { key: 'profile', label: '👤 Profile', desc: 'Personal info' },
              { key: 'traits', label: '🏷️ Traits', desc: 'Personality' },
              { key: 'badges', label: '🏆 Badges', desc: 'Achievements' },
              { key: 'activities', label: '🎯 Activities', desc: 'My events' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <div>{tab.label}</div>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'profile' && renderProfileTab()}
          {activeTab === 'traits' && renderTraitsTab()}
          {activeTab === 'badges' && renderBadgesTab()}
          {activeTab === 'activities' && renderActivitiesTab()}
        </div>
      )}
    </div>
  );
}

