"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  derivePendingOnboardingSteps,
  isPlayStyle,
  isSportType,
  ONBOARDING_TRAIT_GOAL,
  trackOnboardingEntry,
  type OnboardingStep,
  type PlayStyle,
  type SportType,
} from '@dowhat/shared';
import { supabase } from '@/lib/supabase/browser';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { SportOnboardingBanner } from '@/components/profile/SportOnboardingBanner';
import { ReliabilityPledgeBanner } from '@/components/profile/ReliabilityPledgeBanner';
import { OnboardingProgressBanner } from '@/components/profile/OnboardingProgressBanner';
import { KPIGrid } from '@/components/profile/KPIGrid';
import { BadgesPreview } from '@/components/profile/BadgesPreview';
import { AttendanceBars } from '@/components/profile/AttendanceBars';
import { ReliabilityExplainer } from '@/components/profile/ReliabilityExplainer';
import { BioCard } from '@/components/profile/BioCard';
import { ReviewsTab } from '@/components/profile/ReviewsTab';
import { TraitCarousel } from '@/components/traits/TraitCarousel';
import { TraitSelector } from '@/components/traits/TraitSelector';
import { resolveTraitIcon } from '@/components/traits/icon-utils';
import type { TraitSummary } from '@/types/traits';
import type { KPI, Badge, Reliability, AttendanceMetrics, ProfileUser } from '@/types/profile';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

type TabKey = 'overview' | 'traits' | 'badges' | 'activities' | 'reviews';

export default function ProfilePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [reliability, setReliability] = useState<Reliability | null>(null);
  const [attendance, setAttendance] = useState<AttendanceMetrics | undefined>();
  const [traits, setTraits] = useState<TraitSummary[]>([]);
  const [traitEditorOpen, setTraitEditorOpen] = useState(false);
  const [traitsRefreshing, setTraitsRefreshing] = useState(false);
  const [traitEditorError, setTraitEditorError] = useState<string | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoDenied, setGeoDenied] = useState(false);
  const [primarySport, setPrimarySport] = useState<SportType | null>(null);
  const [playStyle, setPlayStyle] = useState<PlayStyle | null>(null);
  const [sportSkillLevel, setSportSkillLevel] = useState<string | null>(null);
  const [sportProfileLoading, setSportProfileLoading] = useState(true);
  const [reliabilityPledgeAckAt, setReliabilityPledgeAckAt] = useState<string | null>(null);
  const [reliabilityPledgeLoading, setReliabilityPledgeLoading] = useState(true);
  const baseTraitCount = traits.reduce((count, trait) => (trait.baseCount > 0 ? count + 1 : count), 0);
  const traitCountLoading = loading || traitsRefreshing;
  const onboardingProgressReady = !traitCountLoading && !sportProfileLoading && !reliabilityPledgeLoading;
  const incompleteSteps = useMemo<OnboardingStep[]>(() => {
    if (!onboardingProgressReady) return [];
    return derivePendingOnboardingSteps({
      traitCount: baseTraitCount,
      primarySport,
      playStyle,
      skillLevel: sportSkillLevel,
      pledgeAckAt: reliabilityPledgeAckAt,
    });
  }, [
    onboardingProgressReady,
    baseTraitCount,
    playStyle,
    primarySport,
    reliabilityPledgeAckAt,
    sportSkillLevel,
  ]);
  const needsTraitOnboarding = incompleteSteps.includes('traits');
  const needsSportOnboarding = incompleteSteps.includes('sport');
  const needsReliabilityPledge = incompleteSteps.includes('pledge');
  const traitShortfall = needsTraitOnboarding ? Math.max(1, ONBOARDING_TRAIT_GOAL - baseTraitCount) : 0;

  const refreshTraits = useCallback(async () => {
    if (!userId) return;
    try {
      setTraitsRefreshing(true);
      const resp = await fetch(`/api/profile/${userId}/traits?top=6`);
      if (!resp.ok) {
        throw new Error(`Failed to refresh traits (${resp.status})`);
      }
      const json = await resp.json();
      setTraits(Array.isArray(json) ? json : []);
      setTraitEditorError(null);
    } catch (err) {
      console.error('Trait refresh failed', err);
      setTraitEditorError(getErrorMessage(err));
    } finally {
      setTraitsRefreshing(false);
    }
  }, [userId]);

  const handleTraitEditorCompleted = useCallback(async () => {
    setTraitEditorOpen(false);
    await refreshTraits();
  }, [refreshTraits]);

  useEffect(() => {
    if (!userId) {
      setTraitEditorOpen(false);
    }
  }, [userId]);

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
        if (traitsRes.ok) {
          const json = await traitsRes.json();
          setTraits(Array.isArray(json) ? json : []);
          setTraitEditorError(null);
        } else {
          setTraits([]);
          setTraitEditorError('Unable to load traits right now.');
        }
        if (badgesRes.ok) setBadges(await badgesRes.json());
      } catch(error) {
        setError(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadProfileMeta = async () => {
      if (!userId) {
        if (!cancelled) {
          setPrimarySport(null);
          setSportSkillLevel(null);
          setReliabilityPledgeAckAt(null);
          setPlayStyle(null);
          setSportProfileLoading(false);
          setReliabilityPledgeLoading(false);
        }
        return;
      }
      setSportProfileLoading(true);
      setReliabilityPledgeLoading(true);
      try {
        const { data: profileRow, error: profileError } = await supabase
          .from('profiles')
          .select('primary_sport, play_style, reliability_pledge_ack_at')
          .eq('id', userId)
          .maybeSingle<{ primary_sport: string | null; play_style: string | null; reliability_pledge_ack_at: string | null }>();
        if (profileError && profileError.code !== 'PGRST116') {
          throw profileError;
        }
        const normalized = profileRow && isSportType(profileRow.primary_sport) ? profileRow.primary_sport : null;
        const normalizedPlayStyle: PlayStyle | null = profileRow && profileRow.play_style && isPlayStyle(profileRow.play_style)
          ? profileRow.play_style
          : null;
        if (!cancelled) {
          setPrimarySport(normalized);
          setPlayStyle(normalizedPlayStyle);
          setReliabilityPledgeAckAt(profileRow?.reliability_pledge_ack_at ?? null);
        }
        if (normalized) {
          const { data: sportRow, error: sportError } = await supabase
            .from('user_sport_profiles')
            .select('skill_level')
            .eq('user_id', userId)
            .eq('sport', normalized)
            .maybeSingle<{ skill_level: string | null }>();
          if (sportError && sportError.code !== 'PGRST116') {
            throw sportError;
          }
          if (!cancelled) {
            setSportSkillLevel(sportRow?.skill_level ?? null);
          }
        } else if (!cancelled) {
          setSportSkillLevel(null);
        }
      } catch (err) {
        console.warn('[profile] failed to load sport/reliability preferences', err);
        if (!cancelled) {
          setPrimarySport(null);
          setSportSkillLevel(null);
          setReliabilityPledgeAckAt(null);
          setPlayStyle(null);
        }
      } finally {
        if (!cancelled) {
          setSportProfileLoading(false);
          setReliabilityPledgeLoading(false);
        }
      }
    };
    void loadProfileMeta();
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
        {incompleteSteps.length > 0 && <OnboardingProgressBanner steps={incompleteSteps} />}
        <div className="mb-8"><KPIGrid kpis={kpis} /></div>
        {needsReliabilityPledge && (
          <ReliabilityPledgeBanner lastAcknowledgedAt={reliabilityPledgeAckAt} steps={incompleteSteps} />
        )}
        {needsSportOnboarding && <SportOnboardingBanner skillLevel={sportSkillLevel} steps={incompleteSteps} />}
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
            <div className="md:col-span-2 lg:col-span-2">
              <TraitCarousel traits={traits.slice(0, 10)} />
            </div>
            <div className="md:col-span-2 lg:col-span-2"><BadgesPreview badges={badges.slice(0,4)} /></div>
            <div className="md:col-span-2 lg:col-span-2"><AttendanceBars metrics={attendance} /></div>
            <div className="md:col-span-2 lg:col-span-2">
              <ReliabilityExplainer reliability={reliability} attendance={attendance} />
            </div>
            <div className="md:col-span-2 lg:col-span-2"><BioCard bio={profile?.bio} editable onSave={saveBio} /></div>
          </div>
        )}
        {activeTab === 'traits' && (
          <div className="mt-8 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setTraitEditorOpen((open) => !open)}
                disabled={traitsRefreshing}
                className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
              >
                {traitEditorOpen ? 'Close trait editor' : 'Edit base traits'}
              </button>
              {traitsRefreshing && <span className="text-xs text-gray-500">Refreshing…</span>}
              {traitEditorError && !traitEditorOpen && (
                <span className="text-xs text-red-600">{traitEditorError}</span>
              )}
              {!traitEditorOpen && !traitEditorError && (
                <span className="text-xs text-gray-500">Update your starting vibes anytime.</span>
              )}
            </div>
            {needsTraitOnboarding && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-teal/25 bg-brand-teal/5 p-4 text-sm text-brand-dark">
                <div className="space-y-1">
                  <p className="text-base font-semibold text-brand-dark">Finish your base traits</p>
                  <p>
                    Pick {traitShortfall} more trait{traitShortfall === 1 ? '' : 's'} to lock in the full onboarding stack and unlock better people filters.
                  </p>
                </div>
                <Link
                  href="/onboarding/traits"
                  className="inline-flex items-center gap-2 rounded-full bg-brand-teal px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
                  onClick={() =>
                    trackOnboardingEntry({
                      source: 'traits-banner',
                      platform: 'web',
                      step: 'traits',
                      steps: incompleteSteps.length > 0 ? incompleteSteps : ['traits'],
                      pendingSteps: Math.max(incompleteSteps.length, 1),
                      nextStep: '/onboarding/traits',
                    })
                  }
                >
                  Go to onboarding
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            )}
            {traitEditorOpen && (
              <TraitSelector
                className="w-full"
                onCompleted={handleTraitEditorCompleted}
              />
            )}
            <TraitCarousel traits={traits} title="Trait stack" description="Scores update as people nominate you." />
            <TraitSummaryList traits={traits} />
          </div>
        )}
        {activeTab === 'badges' && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {badges.map(b => (
              <div key={b.id} className="rounded-lg bg-white border border-gray-200 p-4 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm text-gray-800 truncate">{b.name}</div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      b.status === 'verified'
                        ? 'bg-brand-teal/15 text-brand-teal border-brand-teal/30'
                        : b.status === 'expired'
                          ? 'bg-feedback-danger/10 text-feedback-danger border-feedback-danger/30'
                          : 'bg-ink-subtle text-ink-medium border-midnight-border/20'
                    }`}
                  >
                    {b.status}
                  </span>
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

function TraitSummaryList({ traits }: { traits: TraitSummary[] }) {
  if (!traits.length) {
    return <div className="text-sm text-gray-500">No traits yet.</div>;
  }
  return (
    <div className="space-y-4">
      {traits.map((trait) => (
        <TraitSummaryRow key={trait.id} trait={trait} />
      ))}
    </div>
  );
}

function TraitSummaryRow({ trait }: { trait: TraitSummary }) {
  const Icon = resolveTraitIcon(trait.icon);
  const accent = trait.color || '#0EA5E9';
  const chipBg = `${accent}14`;
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-2xl text-gray-700"
        style={{ backgroundColor: chipBg, color: accent }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-900">{trait.name}</p>
        <p className="text-xs text-gray-500">
          Base picks {trait.baseCount} · Votes {trait.voteCount}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs uppercase tracking-wide text-gray-500">Score</p>
        <p className="text-2xl font-bold text-gray-900">{trait.score}</p>
        <p className="text-[11px] text-gray-500">Updated {new Date(trait.updatedAt).toLocaleDateString()}</p>
      </div>
    </div>
  );
}
