import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureProfileColumns } from '@/lib/db/ensureProfileColumns';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

// Simple authenticated update route for name/avatar fields.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user || auth.user.id !== params.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    await ensureProfileColumns();
  } catch (error) {
    const message = getErrorMessage(error);
    console.error('ensureProfileColumns failed', error);
    return NextResponse.json({ error: message || 'Failed to prepare profile schema' }, { status: 500 });
  }
  const update: Record<string, unknown> = { id: params.id, user_id: params.id, updated_at: new Date().toISOString() };
  if (typeof body.name === 'string') update.full_name = body.name.slice(0, 120);
  if (typeof body.avatarUrl === 'string') update.avatar_url = body.avatarUrl;
  const parseFiniteNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  };

  const requestOrigin = (() => {
    try {
      const url = new URL(req.url);
      return url.origin;
    } catch {
      return null;
    }
  })();
  const baseUrl = requestOrigin || process.env.NEXTAUTH_URL || 'http://localhost:3000';

  const bodyLat = parseFiniteNumber((body as Record<string, unknown>).locationLat);
  const bodyLng = parseFiniteNumber((body as Record<string, unknown>).locationLng);
  const hasBodyCoords = bodyLat != null && bodyLng != null;

  if (hasBodyCoords) {
    update.last_lat = bodyLat;
    update.last_lng = bodyLng;
    try {
      const reverseUrl = new URL('/api/geocode', baseUrl);
      reverseUrl.searchParams.set('lat', String(bodyLat));
      reverseUrl.searchParams.set('lng', String(bodyLng));
      const reverseResponse = await fetch(reverseUrl.toString());
      if (reverseResponse.ok) {
        const reverseData = await reverseResponse.json() as { label?: string | null };
        if (typeof reverseData.label === 'string' && reverseData.label.trim()) {
          update.location = reverseData.label.slice(0, 120);
        }
      }
    } catch (reverseError) {
      console.warn('Failed to reverse geocode precise coordinates', reverseError);
    }
  }

  if (typeof body.location === 'string') {
    const locationString = body.location.slice(0,120);
    if (!('location' in update)) {
      update.location = locationString;
    }

    if (!hasBodyCoords) {
      // Geocode the location text to get coordinates when precise coordinates are not provided.
      try {
        const geocodeUrl = new URL('/api/geocode', baseUrl);
        geocodeUrl.searchParams.set('q', locationString);
        const geocodeResponse = await fetch(geocodeUrl.toString());
        if (geocodeResponse.ok) {
          const geocodeData = await geocodeResponse.json() as { lat?: number; lng?: number; label?: string };
          if (typeof geocodeData.lat === 'number' && typeof geocodeData.lng === 'number') {
            update.last_lat = geocodeData.lat;
            update.last_lng = geocodeData.lng;
          }
          if (typeof geocodeData.label === 'string' && geocodeData.label.trim()) {
            update.location = geocodeData.label.slice(0, 120);
          }
        }
      } catch (geocodeError) {
        console.warn('Failed to geocode location text', geocodeError);
        // Continue without coordinates - location string is still saved
      }
    }
  } else if (body.location === null) {
    update.location = null;
    update.last_lat = null;
    update.last_lng = null;
  }
  if (typeof body.bio === 'string') {
    update.bio = body.bio.slice(0, 1000);
  } else if (body.bio === null) {
    update.bio = null;
  }
  if (body.socials && typeof body.socials === 'object') {
    const socials = body.socials as Record<string, unknown>;
    if ('instagram' in socials) {
      if (typeof socials.instagram === 'string') {
        update.instagram = (socials.instagram as string).slice(0,50);
      } else if (socials.instagram === null) {
        update.instagram = null;
      }
    }
    if ('whatsapp' in socials) {
      if (typeof socials.whatsapp === 'string') {
        update.whatsapp = (socials.whatsapp as string).slice(0,20); // E.164 max 16 incl +, generous cap
      } else if (socials.whatsapp === null) {
        update.whatsapp = null;
      }
    }
  }
  const { error } = await supabase.from('profiles').upsert(update, { onConflict: 'id' });
  if (!error) {
    return NextResponse.json({ ok: true });
  }

  const missingColumnMatch = /column/iu.test(error.message) && /(bio|location|instagram|whatsapp)/iu.test(error.message);
  if (!missingColumnMatch) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.warn('profiles.upsert failed due to missing columns; retrying without optional fields', error.message);
  const fallbackUpdate: Record<string, unknown> = { ...update };
  delete fallbackUpdate.bio;
  delete fallbackUpdate.location;
  delete fallbackUpdate.instagram;
  delete fallbackUpdate.whatsapp;

  const { error: fallbackError } = await supabase.from('profiles').upsert(fallbackUpdate, { onConflict: 'id' });
  if (fallbackError) {
    return NextResponse.json({ error: fallbackError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, warning: 'Profile updated without bio/social fields; run db:ensure-profile-columns to add them.' });
}
