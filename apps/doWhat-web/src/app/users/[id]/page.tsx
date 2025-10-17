"use client";
import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import BadgesGrid from '@/components/BadgesGrid';
import Link from 'next/link';
import { BADGE_VERIFICATION_THRESHOLD_DEFAULT, type BadgeStatus } from '@dowhat/shared';
import { supabase } from '@/lib/supabase/browser';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

export default function PublicUserPage() {
  const params = useParams();
  const userId = params?.id as string;
  const [me, setMe] = useState<string | null>(null);
  interface OwnedBadgeLite { id: string; badge_id: string; status: BadgeStatus; endorsements?: number; badges?: { name?: string; description?: string } | null }
  interface CatalogEntry { catalog: { id: string; name?: string; description?: string }; owned?: { id: string; badge_id: string; status: BadgeStatus; source?: string } | null }
  type MergedEntry = (OwnedBadgeLite & { locked?: false }) | ({ badge_id: string; status: BadgeStatus; badges?: { name?: string; description?: string } | null; locked: true })
  const [badges, setBadges] = useState<OwnedBadgeLite[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [endorsing, setEndorsing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>('');
  const [err, setErr] = useState<string>('');
  const [endorseMsg, setEndorseMsg] = useState('');
  const [endorseErr, setEndorseErr] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        setMe(auth?.user?.id || null);
        const [ownedRes, catalogRes] = await Promise.all([
          fetch(`/api/users/${userId}/badges`, { cache: 'no-store' }),
          fetch(`/api/badges/catalog`, { cache: 'no-store' }),
        ]);
        if (ownedRes.ok) {
          const json = await ownedRes.json();
          setBadges((json.badges || []) as OwnedBadgeLite[]);
        }
        if (catalogRes.ok) {
          const json = await catalogRes.json();
          setCatalog((json.badges || []) as CatalogEntry[]);
        }
      } catch (error) {
        setErr(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const merged: MergedEntry[] = useMemo(() => {
    if (!catalog.length) return badges;
    const ownedMap = new Map(badges.map(b => [b.badge_id, b] as const));
    return catalog.map(c => {
      if (c.owned && c.owned.badge_id) {
        const endorsements = badges.find(b => b.badge_id === c.catalog.id)?.endorsements ?? 0;
        const ob = ownedMap.get(c.catalog.id) || {
          id: c.owned.id,
          badge_id: c.catalog.id,
          status: c.owned.status,
          endorsements,
          badges: c.catalog,
        };
        return ob as MergedEntry;
      }
      return { badge_id: c.catalog.id, status: 'unverified', badges: c.catalog, locked: true } as MergedEntry;
    });
  }, [catalog, badges]);

  async function endorse(badge_id: string) {
    setErr(''); setMsg('');
    setEndorseErr(''); setEndorseMsg('');
    setEndorsing(badge_id);
    setBadges(prev => prev.map(b => b.badge_id === badge_id ? { ...b, endorsements: (b.endorsements||0)+1 } : b));
    try {
      const res = await fetch(`/api/users/${userId}/badges/endorse`, { method: 'POST', body: JSON.stringify({ badge_id, threshold: BADGE_VERIFICATION_THRESHOLD_DEFAULT }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setBadges(prev => prev.map(b => b.badge_id === badge_id ? { ...b, endorsements: json.endorsements, status: json.verified ? 'verified' : b.status } : b));
      setMsg(json.verified ? 'Badge verified!' : 'Endorsed!');
    } catch (error: unknown) {
      setErr(getErrorMessage(error));
      const ownedRes = await fetch(`/api/users/${userId}/badges`, { cache: 'no-store' });
      if (ownedRes.ok) {
        const js = await ownedRes.json();
        setBadges(js.badges || []);
      }
    } finally {
      setEndorsing(null);
    }
  }

  const canEndorse = me && me !== userId;
  const availableForEndorse = merged.filter(m => !m.locked || m.status !== 'verified');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="text-sm text-blue-600 hover:underline">← Home</Link>
          {canEndorse && <div className="text-xs text-gray-500">Viewing public profile</div>}
        </div>
        <h1 className="text-2xl font-bold mb-2">User Badges</h1>
        {loading && <div className="text-gray-500 mb-4">Loading...</div>}
        {err && <div className="mb-4 rounded bg-red-50 border border-red-200 p-3 text-sm text-red-700">{err}</div>}
        {msg && <div className="mb-4 rounded bg-green-50 border border-green-200 p-3 text-sm text-green-700">{msg}</div>}
        {endorseErr && <div className="text-sm text-red-600 mb-2">{endorseErr}</div>}
        {endorseMsg && <div className="text-sm text-green-600 mb-2">{endorseMsg}</div>}
        <div className="mb-8">
          <BadgesGrid items={merged} />
        </div>
        {canEndorse && (
          <div className="bg-white border border-gray-200 p-4 rounded-lg">
            <h2 className="font-semibold mb-3 text-sm">Endorse this user</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {availableForEndorse.map(b => (
                <button
                  key={b.badge_id}
                  disabled={endorsing === b.badge_id}
                  onClick={() => endorse(b.badge_id)}
                  className="flex items-center gap-2 rounded border border-gray-300 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className="text-lg">🏅</span>
                  <span className="flex-1">
                    <span className="font-medium text-gray-800 text-sm">{b.badges?.name || 'Badge'}</span>
                    <span className="block text-xs text-gray-500">{b.status === 'verified' ? 'Verified' : 'Click to endorse'}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-3">Multiple endorsements increase verification chances. Self-endorsement is blocked.</p>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {badges.map(b => {
            const endorsements = b.endorsements ?? 0;
            return (
              <div key={b.id} className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3 bg-gray-50">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">🏅</div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{b.badges?.name}</div>
                    <div className="text-xs text-gray-600">Endorsements: {endorsements}</div>
                    {b.badges?.description && <div className="text-sm text-gray-600 mt-1">{b.badges.description}</div>}
                  </div>
                </div>
                <div className="h-1.5 w-full rounded bg-gray-200 overflow-hidden">
                  <div className="h-full bg-amber-400" style={{ width: `${Math.min(100, (endorsements/3)*100)}%` }} />
                </div>
                <button onClick={()=>endorse(b.badge_id)} className="text-xs px-3 py-1 rounded bg-blue-600 text-white self-start">Endorse</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
