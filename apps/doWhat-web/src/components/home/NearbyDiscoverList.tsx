"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Item = { id: string; name: string; venue?: string; lat?: number; lng?: number; distance_m?: number };

export default function NearbyDiscoverList() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!('geolocation' in navigator)) return;
      navigator.geolocation.getCurrentPosition(
        async (p) => {
          try {
            const url = new URL('/api/nearby', window.location.origin);
            url.searchParams.set('lat', String(p.coords.latitude));
            url.searchParams.set('lng', String(p.coords.longitude));
            url.searchParams.set('radius', '2000');
            const res = await fetch(url.toString());
            const json = await res.json();
            if (!cancelled) setItems(json.activities || []);
          } catch (error) {
            if (!cancelled) {
              const message = error instanceof Error ? error.message : 'Failed to load nearby activities';
              setErr(message);
            }
          }
        },
        () => {
          // silent if user denies; section simply won’t show
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    })();
    return () => { cancelled = true; };
  }, []);

  if (err) {
    return <div className="text-sm text-red-600">{err}</div>;
  }
  if (!items || items.length === 0) return null;

  return (
    <div>
      <h3 className="mb-md text-xl font-semibold text-ink">Discovered Nearby</h3>
      <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-3">
        {items.map((it) => (
          <div key={it.id} className="rounded-lg border border-midnight-border/40 bg-surface p-md shadow-sm">
            <div className="mb-xxs text-base font-semibold">{it.name}</div>
            {it.venue && <div className="mb-xs text-sm text-ink-medium">{it.venue}</div>}
            {typeof it.distance_m === 'number' && (
              <div className="mb-xs text-xs text-ink-muted">~{Math.round(it.distance_m / 10) / 100} km away</div>
            )}
            <Link
              href={{ pathname: `/activities/${it.id}` }}
              className="text-emerald-700 hover:underline text-sm"
            >
              View details →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
