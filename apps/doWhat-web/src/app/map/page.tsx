"use client";
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const WebMap = dynamic(() => import('@/components/WebMap'), { ssr: false });

export default function MapPage() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => setPos({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) }),
        () => setPos({ lat: 51.5074, lng: -0.1278 }) // London default
      );
    } else {
      setPos({ lat: 51.5074, lng: -0.1278 });
    }
    // Safety fallback: if browser geolocation hangs, set a default after 2s
    const t = setTimeout(() => {
      setPos((prev) => prev ?? { lat: 51.5074, lng: -0.1278 });
    }, 2000);
    return () => clearTimeout(t);
  }, []);
  if (!pos) return <div className="p-6">Locating…</div>;
  return (
    <div>
      <div className="fixed right-4 top-20 z-10">
        <Link href="/filter?from=map" className="rounded-md border border-emerald-600 bg-white px-3 py-2 text-sm text-emerald-700 shadow hover:bg-emerald-50">⚙️ Filters</Link>
      </div>
      <WebMap center={pos} />
    </div>
  );
}
