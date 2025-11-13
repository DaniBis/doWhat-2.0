"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/browser';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { KPIGrid } from '@/components/profile/KPIGrid';
import { TraitsPreview } from '@/components/profile/TraitsPreview';
import { BadgesPreview } from '@/components/profile/BadgesPreview';
import { AttendanceBars } from '@/components/profile/AttendanceBars';
import { BioCard } from '@/components/profile/BioCard';
import { ReviewsTab } from '@/components/profile/ReviewsTab';
import type { KPI, Trait, Badge, Reliability, AttendanceMetrics, ProfileUser } from '@/types/profile';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

type TabKey = 'overview' | 'traits' | 'badges' | 'activities' | 'reviews';

export default function ProfilePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [reliability, setReliability] = useState<Reliability | null>(null);
  const [attendance, setAttendance] = useState<AttendanceMetrics | undefined>();
  const [traits, setTraits] = useState<Trait[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoDenied, setGeoDenied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id || null;
      setUserId(uid);
      if (!uid) { setLoading(false); return; }
      try {
        const [profileRes, kpiRes, relRes, traitsRes, badgesRes] = await Promise.all([
          fetch(`/api/profile/${uid}`),
          fetch(`/api/profile/${uid}/kpis`),
          fetch(`/api/profile/${uid}/reliability`),
          fetch(`/api/profile/${uid}/traits?top=6`),
          fetch(`/api/profile/${uid}/badges?limit=4`)
        ]);
        if (profileRes.ok) setProfile(await profileRes.json());
        if (kpiRes.ok) setKpis(await kpiRes.json());
        if (relRes.ok) { const r = await relRes.json(); setReliability(r.reliability); setAttendance(r.attendance); }
        if (traitsRes.ok) setTraits(await traitsRes.json());
        if (badgesRes.ok) setBadges(await badgesRes.json());
      } catch(error) {
        setError(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Attempt to capture geolocation & populate location if missing once profile is loaded.
  useEffect(() => {
    // Treat placeholder 'Unknown' as missing
    if (!profile || (profile.location && profile.location !== 'Unknown') || geoBusy || geoDenied) return;
    if (!('geolocation' in navigator)) return;
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        let label = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
        try {
          const resp = await fetch(`/api/geocode?lat=${latitude}&lng=${longitude}`);
          if (resp.ok) { const g = await resp.json(); if (g.label) label = g.label; }
        } catch { /* ignore geocode errors; keep coarse */ }
        setProfile(p => p ? { ...p, location: label } : p);
        if (userId) {
          await fetch(`/api/profile/${userId}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ location: label })
          });
        }
      } catch { /* ignore */ }
      setGeoBusy(false);
    }, () => { setGeoDenied(true); setGeoBusy(false); }, { enableHighAccuracy: false, timeout: 7000 });
  }, [profile, userId, geoBusy, geoDenied]);

  async function saveBio(bio: string) {
    if (!userId) return;
    try {
      const resp = await fetch(`/api/profile/${userId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio })
      });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => null);
        throw new Error(detail?.error || 'Failed to update bio');
      }
      setProfile(p => p ? { ...p, bio } : p);
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading profile…</div>;
  if (!userId) return <div className="min-h-screen flex items-center justify-center text-gray-500">Sign in to view profile.</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <ProfileHeader
        userId={userId}
        name={profile?.name || profile?.email || 'User'}
        location={profile?.location}
        avatarUrl={profile?.avatarUrl}
        bio={profile?.bio}
        reliability={reliability || undefined}
        editable
        socials={profile?.socials}
        onProfileUpdated={async (p) => {
          if (!userId) return;
          try {
            const resp = await fetch(`/api/profile/${userId}/update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(p),
            });
            if (!resp.ok) {
              const detail = await resp.json().catch(() => null);
              throw new Error(detail?.error || 'Failed to update profile');
            }
            setProfile(prev => prev ? {
              ...prev,
              name: p.name ?? prev.name,
              avatarUrl: p.avatarUrl ?? prev.avatarUrl,
              socials: p.socials ? {
                instagram: p.socials.instagram === null ? undefined : (p.socials.instagram ?? prev.socials?.instagram),
                whatsapp: p.socials.whatsapp === null ? undefined : (p.socials.whatsapp ?? prev.socials?.whatsapp),
              } : prev.socials,
              bio: p.bio !== undefined ? p.bio : prev.bio,
              location: p.location !== undefined ? (p.location ?? undefined) : prev.location,
            } : prev);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Profile update failed', e);
            throw e;
          }
        }}
      />
      <main className="max-w-5xl mx-auto px-6 -mt-8 relative z-10 pb-20">
        {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
        <div className="mb-8"><KPIGrid kpis={kpis} /></div>
        {profile?.socials && (profile.socials.instagram || profile.socials.whatsapp) && (
          <div className="mb-6 flex flex-wrap gap-3 items-center text-sm">
            {profile.socials.instagram && (() => {
              const raw = profile.socials.instagram.trim();
              // If user stored full URL already, use as-is; else build canonical URL
              const isUrl = /^https?:\/\//i.test(raw);
              const handle = raw
                .replace(/@/g,'')
                .replace(/^https?:\/\/([^/]*instagram\.com)\//i,'')
                .replace(/^instagram\.com\//i,'')
                .replace(/^www\.instagram\.com\//i,'')
                .split(/[?#]/)[0]
                .replace(/\/+$/,'');
              const url = isUrl ? raw : `https://instagram.com/${handle}`;
              return (
                <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-gray-200 hover:border-pink-400 hover:text-pink-600 transition">
                  <span className="font-medium">IG</span><span>@{handle}</span>
                </a>
              );
            })()}
            {profile.socials.whatsapp && profile.socials.whatsapp.trim() && (() => {
              const raw = profile.socials.whatsapp.trim();
              const digits = raw.startsWith('+') ? raw : `+${raw}`;
              const linkNumber = digits.replace(/[^+\d]/g,'');
              const waUrl = `https://wa.me/${linkNumber.replace(/^\+/,'')}`;
              return (
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-gray-200 hover:border-green-400 hover:text-green-600 transition">
                  <span className="font-medium">WA</span><span>{linkNumber}</span>
                </a>
              );
            })()}
          </div>
        )}
        <Tabs active={activeTab} onChange={setActiveTab} />
        {activeTab === 'overview' && (
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="md:col-span-2 lg:col-span-2"><TraitsPreview traits={traits.slice(0,6)} /></div>
            <div className="md:col-span-2 lg:col-span-2"><BadgesPreview badges={badges.slice(0,4)} /></div>
            <div className="md:col-span-2 lg:col-span-2"><AttendanceBars metrics={attendance} /></div>
            <div className="md:col-span-2 lg:col-span-2"><BioCard bio={profile?.bio} editable onSave={saveBio} /></div>
          </div>
        )}
        {activeTab === 'traits' && (
          <div className="mt-8 space-y-4">{traits.map(t => (
            <div key={t.id} className="rounded-lg bg-white p-4 border border-gray-200 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-800">{t.name}</div>
                <div className="text-xs text-gray-600">{t.category}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold tabular-nums">{Math.round(t.score)}</span>
                <span className="w-2 h-2 rounded-full" style={{ background: t.confidence>=0.75?'#059669': t.confidence>=0.5?'#d97706':'#9ca3af'}} />
              </div>
            </div>
          )) || <div className="text-sm text-gray-500">No traits yet.</div>}</div>
        )}
        {activeTab === 'badges' && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {badges.map(b => (
              <div key={b.id} className="rounded-lg bg-white border border-gray-200 p-4 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm text-gray-800 truncate">{b.name}</div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${b.status==='verified'?'bg-emerald-100 text-emerald-700 border-emerald-200': b.status==='expired'?'bg-red-100 text-red-600 border-red-200':'bg-gray-100 text-gray-600 border-gray-200'}`}>{b.status}</span>
                </div>
                <div className="text-xs text-gray-600 flex items-center gap-2">
                  {b.level && <span className="font-mono bg-gray-100 px-1 rounded border border-gray-200">L{b.level}</span>}
                  {b.earnedAt && <span>{new Date(b.earnedAt).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
            {badges.length === 0 && <div className="text-sm text-gray-500">No badges yet.</div>}
          </div>
        )}
        {activeTab === 'activities' && (
          <ActivitiesPlaceholder userId={userId} />
        )}
        {activeTab === 'reviews' && <div className="mt-8"><ReviewsTab userId={userId} /></div>}
      </main>
    </div>
  );
}

function Tabs({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'traits', label: 'Traits' },
    { key: 'badges', label: 'Badges' },
    { key: 'activities', label: 'Activities' },
    { key: 'reviews', label: 'Reviews' },
  ];
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Profile sections">
      {tabs.map(t => (
        <button key={t.key} onClick={()=>onChange(t.key)} className={`px-4 py-2 rounded-full text-sm font-medium border transition ${active===t.key?'bg-white shadow border-gray-300':'bg-gray-100 hover:bg-gray-200 border-transparent'}`}>{t.label}</button>
      ))}
    </nav>
  );
}

type ActivityTimelineEntry = {
  id: string;
  label: string;
  ts: string;
};

function ActivitiesPlaceholder({ userId }: { userId: string }) {
  const [timeline, setTimeline] = useState<ActivityTimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/profile/${userId}/activities?range=90d`);
        if (!response.ok) throw new Error('Failed to load activities');
        const json = await response.json();
        setTimeline(Array.isArray(json.timeline) ? json.timeline : []);
      } catch (error) {
        console.error('Failed to load profile activities', error);
        setTimeline([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);
  return (
    <div className="mt-8 rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
      <h3 className="font-semibold text-gray-800 mb-4">Activities</h3>
      {loading && <div className="text-sm text-gray-500">Loading…</div>}
      {!loading && timeline.length===0 && <div className="text-sm text-gray-500">No recent activity.</div>}
      <ul className="space-y-3">
        {timeline.map(a => (
          <li key={a.id} className="flex items-center gap-3 text-sm">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="flex-1 truncate">{a.label}</span>
            <span className="text-xs text-gray-500 tabular-nums">{new Date(a.ts).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
