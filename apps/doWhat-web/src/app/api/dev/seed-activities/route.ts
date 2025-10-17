import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { db } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { lat, lng, n = 12, radius = 1500 } = await request.json().catch(() => ({}));
    const centerLat = Number(lat ?? 51.5074);
    const centerLng = Number(lng ?? -0.1278);
    const count = Math.min(Math.max(Number(n) || 12, 1), 50);
    const r = Math.min(Math.max(Number(radius) || 1500, 200), 5000);

    const supabase = db();
    const { data, error } = await supabase.rpc('seed_activities', {
      lat: centerLat,
      lng: centerLng,
      n: count,
      radius_m: r,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, created: data ?? 0 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
