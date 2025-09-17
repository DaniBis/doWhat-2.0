import { NextResponse } from 'next/server';

// Simple reverse geocoder (OpenStreetMap Nominatim) – low volume only.
// NOTE: For production heavy use, move to a paid geocoding service + caching.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng') || searchParams.get('lon');
  if (!lat || !lng) return NextResponse.json({ error: 'lat & lng required' }, { status: 400 });
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=10&addressdetails=1`, {
      headers: {
        'User-Agent': `doWhat/1.0 (${process.env.NOMINATIM_EMAIL || 'contact@example.com'})`
      },
      // Avoid Next.js fetch caching for dynamic geocode, but set internal cache TTL via revalidate.
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!r.ok) return NextResponse.json({ error: 'geocode failed', status: r.status }, { status: 502 });
    const j: any = await r.json();
    const addr = j.address || {};
    const parts = [addr.city || addr.town || addr.village || addr.hamlet, addr.state, addr.country]
      .filter(Boolean)
      .slice(0,3);
    const label = parts.join(', ');
    return NextResponse.json({ label, raw: { city: addr.city || addr.town || addr.village || addr.hamlet, state: addr.state, country: addr.country } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'reverse geocode error' }, { status: 500 });
  }
}
