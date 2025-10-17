import { NextResponse } from 'next/server';

import { getErrorMessage } from '@/lib/utils/getErrorMessage';

const USER_AGENT = `doWhat/1.0 (${process.env.NOMINATIM_EMAIL || 'contact@example.com'})`;

// Simple geocoding helper backed by OpenStreetMap Nominatim – low volume only.
// Supports both reverse (lat/lng) and forward (q=search string) lookups.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const query = searchParams.get('q');
  if (query) {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('q', query);
      url.searchParams.set('limit', '1');
      url.searchParams.set('addressdetails', '1');

      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': USER_AGENT },
        next: { revalidate: 60 * 60 * 24 },
      });
      if (!res.ok) {
        return NextResponse.json({ error: 'geocode failed', status: res.status }, { status: 502 });
      }

      const payload = (await res.json()) as Array<{
        lat?: string;
        lon?: string;
        display_name?: string;
        address?: { city?: string; town?: string; village?: string; hamlet?: string; state?: string; country?: string };
      }>;

      const first = payload?.[0];
      if (!first?.lat || !first?.lon) {
        return NextResponse.json({ error: 'no results' }, { status: 404 });
      }

      const lat = Number(first.lat);
      const lng = Number(first.lon);
      const addr = first.address || {};
      const locality = addr.city || addr.town || addr.village || addr.hamlet || null;
      const parts = [locality, addr.state, addr.country]
        .filter(Boolean)
        .slice(0, 3);
      const label = parts.length ? parts.join(', ') : (first.display_name ?? query);

      return NextResponse.json({ label, lat, lng });
    } catch (error: unknown) {
      return NextResponse.json({ error: getErrorMessage(error) || 'forward geocode error' }, { status: 500 });
    }
  }

  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng') || searchParams.get('lon');
  if (!lat || !lng) return NextResponse.json({ error: 'lat & lng required' }, { status: 400 });
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=10&addressdetails=1`, {
      headers: {
        'User-Agent': USER_AGENT,
      },
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!r.ok) return NextResponse.json({ error: 'geocode failed', status: r.status }, { status: 502 });
    const j = (await r.json()) as { address?: { city?: string; town?: string; village?: string; hamlet?: string; state?: string; country?: string } };
    const addr = j.address || {};
    const locality = addr.city || addr.town || addr.village || addr.hamlet || null;
    const parts = [locality, addr.state, addr.country]
      .filter(Boolean)
      .slice(0, 3);
    const label = parts.join(', ');
    return NextResponse.json({ label, raw: { city: locality, state: addr.state, country: addr.country } });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) || 'reverse geocode error' }, { status: 500 });
  }
}
