import { NextResponse } from 'next/server';

import { getErrorMessage } from '@/lib/utils/getErrorMessage';

const USER_AGENT = `doWhat/1.0 (${process.env.NOMINATIM_EMAIL || 'contact@example.com'})`;

type GeocodeSuggestion = { label: string; description: string | null; lat: number; lng: number };

const GOOGLE_TEXT_SEARCH_ENDPOINT = 'https://maps.googleapis.com/maps/api/place/textsearch/json';

const fetchGoogleSuggestions = async (
  query: string,
  options: { limit: number; nearLat?: number; nearLng?: number; nearRadius?: number },
): Promise<GeocodeSuggestion[]> => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  const url = new URL(GOOGLE_TEXT_SEARCH_ENDPOINT);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('query', query);
  const hasNearBias =
    typeof options.nearLat === 'number' && Number.isFinite(options.nearLat) &&
    typeof options.nearLng === 'number' && Number.isFinite(options.nearLng);
  if (hasNearBias) {
    const radius = Math.min(50000, Math.max(200, Math.round(options.nearRadius ?? 3000)));
    url.searchParams.set('location', `${options.nearLat!.toFixed(6)},${options.nearLng!.toFixed(6)}`);
    url.searchParams.set('radius', String(radius));
  }

  const response = await fetch(url.toString(), { next: { revalidate: 60 * 60 * 12 } });
  if (!response.ok) {
    console.warn('Google text search HTTP error', response.status);
    return [];
  }

  const payload = (await response.json()) as {
    status?: string;
    error_message?: string;
    results?: Array<{
      name?: string;
      formatted_address?: string;
      business_status?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };

  if (payload.status && payload.status !== 'OK') {
    if (payload.status !== 'ZERO_RESULTS') {
      console.warn('Google text search responded with status', payload.status, payload.error_message);
    }
    if (payload.status === 'ZERO_RESULTS') return [];
  }

  const candidates = (payload.results ?? [])
    .filter((result) => result.business_status !== 'CLOSED_PERMANENTLY')
    .map((result) => {
      const name = typeof result.name === 'string' ? result.name.trim() : '';
      const address = typeof result.formatted_address === 'string' ? result.formatted_address.trim() : null;
      const lat = result.geometry?.location?.lat;
      const lng = result.geometry?.location?.lng;
      if (!name || typeof lat !== 'number' || typeof lng !== 'number') return null;
      return { label: name, description: address, lat, lng } satisfies GeocodeSuggestion;
    })
    .filter((value): value is GeocodeSuggestion => Boolean(value));

  return candidates.slice(0, Math.max(1, options.limit));
};

// Simple geocoding helper backed by OpenStreetMap Nominatim – low volume only.
// Supports both reverse (lat/lng) and forward (q=search string) lookups.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const query = searchParams.get('q');
  if (query) {
    const limitParam = Number.parseInt(searchParams.get('limit') ?? '1', 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 5) : 1;
    const nearLatParsed = Number.parseFloat(searchParams.get('nearLat') ?? '');
    const nearLngParsed = Number.parseFloat(searchParams.get('nearLng') ?? searchParams.get('nearLon') ?? '');
    const nearLatValue = Number.isFinite(nearLatParsed) ? nearLatParsed : undefined;
    const nearLngValue = Number.isFinite(nearLngParsed) ? nearLngParsed : undefined;
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('q', query);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('addressdetails', '1');

      const hasNear = typeof nearLatValue === 'number' && typeof nearLngValue === 'number';
      let nearRadius: number | undefined;
      if (hasNear) {
        url.searchParams.set('lat', nearLatValue!.toFixed(6));
        url.searchParams.set('lon', nearLngValue!.toFixed(6));
        const radiusParam = Number.parseInt(searchParams.get('nearRadius') ?? '', 10);
        nearRadius = Number.isFinite(radiusParam) && radiusParam > 0 ? Math.min(Math.max(radiusParam, 250), 20000) : 3000;
        url.searchParams.set('radius', String(nearRadius));
      }

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

      const results = (payload ?? [])
        .map((item) => {
          if (!item?.lat || !item?.lon) return null;
          const lat = Number(item.lat);
          const lng = Number(item.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          const addr = item.address || {};
          const locality = addr.city || addr.town || addr.village || addr.hamlet || null;
          const parts = [locality, addr.state, addr.country].filter(Boolean).slice(0, 3);
          const label = parts.length ? parts.join(', ') : item.display_name || query;
          const description = item.display_name && item.display_name !== label ? item.display_name : null;
          return { label, description, lat, lng };
        })
        .filter((entry): entry is { label: string; description: string | null; lat: number; lng: number } => Boolean(entry));

      if (!results.length) {
        const fallback = await fetchGoogleSuggestions(query, {
          limit,
          nearLat: nearLatValue,
          nearLng: nearLngValue,
          nearRadius,
        });
        if (!fallback.length) {
          return NextResponse.json({ error: 'no results' }, { status: 404 });
        }
        const primaryFallback = fallback[0];
        return NextResponse.json({
          label: primaryFallback.label,
          lat: primaryFallback.lat,
          lng: primaryFallback.lng,
          results: fallback,
        });
      }

      const primary = results[0];
      return NextResponse.json({
        label: primary.label,
        lat: primary.lat,
        lng: primary.lng,
        results,
      });
    } catch (error: unknown) {
      const fallback = await fetchGoogleSuggestions(query, {
        limit,
        nearLat: nearLatValue,
        nearLng: nearLngValue,
      });
      if (fallback.length) {
        const primaryFallback = fallback[0];
        return NextResponse.json({
          label: primaryFallback.label,
          lat: primaryFallback.lat,
          lng: primaryFallback.lng,
          results: fallback,
        });
      }
      return NextResponse.json({ error: getErrorMessage(error) || 'forward geocode error' }, { status: 500 });
    }
  }

  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng') || searchParams.get('lon');
  if (!lat || !lng) return NextResponse.json({ error: 'lat & lng required' }, { status: 400 });
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`, {
      headers: {
        'User-Agent': USER_AGENT,
      },
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!r.ok) return NextResponse.json({ error: 'geocode failed', status: r.status }, { status: 502 });
    const j = (await r.json()) as {
      display_name?: string | null;
      address?: {
        house_number?: string | null;
        road?: string | null;
        residential?: string | null;
        neighbourhood?: string | null;
        city?: string | null;
        town?: string | null;
        village?: string | null;
        hamlet?: string | null;
        state?: string | null;
        postcode?: string | null;
        country?: string | null;
      };
    };
    const addr = j.address || {};
    const line1 = [addr.house_number, addr.road || addr.residential].filter(Boolean).join(' ').trim();
    const locality = addr.city || addr.town || addr.village || addr.hamlet || addr.neighbourhood || null;
    const regionParts = [addr.postcode, addr.state, addr.country].filter(Boolean);
    const labelParts = [line1 || null, locality, regionParts.length ? regionParts.join(', ') : null].filter(Boolean);
    const label = labelParts.join(', ');
    const description = j.display_name && j.display_name !== label ? j.display_name : null;
    return NextResponse.json({
      label: label || j.display_name || null,
      description: description || label || null,
      raw: {
        line1: line1 || null,
        locality,
        state: addr.state ?? null,
        postcode: addr.postcode ?? null,
        country: addr.country ?? null,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) || 'reverse geocode error' }, { status: 500 });
  }
}
