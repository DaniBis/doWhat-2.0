import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { db } from '@/lib/db';

const SAMPLE = [
  { name: 'Archery Club', tags: ['outdoor','focus'], types: ['archery'] },
  { name: 'Morning Yoga', tags: ['wellness'], types: ['yoga'] },
  { name: 'Group Run', tags: ['cardio'], types: ['running'] },
  { name: 'Tennis Meetup', tags: ['rackets'], types: ['tennis'] },
  { name: 'Climbing Gym', tags: ['indoor'], types: ['climbing'] },
  { name: 'Pickup Soccer', tags: ['team'], types: ['soccer'] },
  { name: 'Basketball Court', tags: ['team'], types: ['basketball'] },
  { name: 'Community Swim', tags: ['water'], types: ['swimming'] },
  { name: 'Cycling Group', tags: ['cardio'], types: ['cycling'] },
  { name: 'Hiking Trailhead', tags: ['outdoor'], types: ['hiking'] },
  { name: 'Golf Range', tags: ['rackets'], types: ['golf'] },
  { name: 'Surf School', tags: ['water'], types: ['surfing'] },
];

function jitter(base: number, meters: number) {
  const deg = meters / 111_320; // rough meters to degrees
  return base + (Math.random() * 2 - 1) * deg;
}

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
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
