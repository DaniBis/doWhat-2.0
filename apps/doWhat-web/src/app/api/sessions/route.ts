import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

type EnsurePayload = {
  activityId?: string | null;
  activityName?: string | null;
  venueId?: string | null;
  venueName?: string | null;
  lat: number;
  lng: number;
  price: number;
  startsAt: string;
  endsAt: string;
  description?: string | null;
};

export async function GET() {
  return NextResponse.json([]);
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    const body = (await req.json()) as Partial<EnsurePayload>;

    const latNumber = Number(body.lat);
    const lngNumber = Number(body.lng);
    if (!Number.isFinite(latNumber) || !Number.isFinite(lngNumber)) {
      return NextResponse.json({ error: 'Valid latitude and longitude are required.' }, { status: 400 });
    }

    const startValue = typeof body.startsAt === 'string' && body.startsAt ? body.startsAt : null;
    const endValue = typeof body.endsAt === 'string' && body.endsAt ? body.endsAt : null;
    if (!startValue || !endValue) {
      return NextResponse.json({ error: 'Start and end times are required.' }, { status: 400 });
    }

    const startDate = new Date(startValue);
    const endDate = new Date(endValue);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Start or end time is invalid.' }, { status: 400 });
    }
    if (endDate <= startDate) {
      return NextResponse.json({ error: 'End time must be after the start time.' }, { status: 400 });
    }

    const priceNumber = Number(body.price) || 0;
    const priceCents = Math.max(0, Math.round(priceNumber * 100));

    const service = createServiceClient();

    // Resolve activity
    let activityId = typeof body.activityId === 'string' && body.activityId.trim() ? body.activityId.trim() : null;
    const activityName = typeof body.activityName === 'string' ? body.activityName.trim() : '';
    if (!activityId) {
      if (!activityName) {
        return NextResponse.json({ error: 'Activity name is required.' }, { status: 400 });
      }

      const { data: existingActivity, error: fetchActivityError } = await service
        .from('activities')
        .select('id')
        .eq('name', activityName)
        .maybeSingle<{ id: string }>();
      if (fetchActivityError) throw fetchActivityError;

      if (existingActivity?.id) {
        activityId = existingActivity.id;
      } else {
        const { data: insertedActivity, error: insertActivityError } = await service
          .from('activities')
          .insert({ name: activityName })
          .select('id')
          .single<{ id: string }>();
        if (insertActivityError) throw insertActivityError;
        activityId = insertedActivity.id;
      }
    }

    if (!activityId) {
      return NextResponse.json({ error: 'Unable to resolve activity.' }, { status: 400 });
    }

    // Resolve venue
    let venueId = typeof body.venueId === 'string' && body.venueId.trim() ? body.venueId.trim() : null;
    const venueName = typeof body.venueName === 'string' ? body.venueName.trim() : '';

    if (!venueId) {
      if (!venueName) {
        return NextResponse.json({ error: 'Venue name is required.' }, { status: 400 });
      }

      const { data: existingVenue, error: fetchVenueError } = await service
        .from('venues')
        .select('id')
        .eq('name', venueName)
        .maybeSingle<{ id: string }>();
      if (fetchVenueError) throw fetchVenueError;

      if (existingVenue?.id) {
        venueId = existingVenue.id;
      } else {
        const venueInsert: { name: string; lat?: number; lng?: number } = { name: venueName };
        if (Number.isFinite(latNumber)) venueInsert.lat = latNumber;
        if (Number.isFinite(lngNumber)) venueInsert.lng = lngNumber;

        const { data: insertedVenue, error: insertVenueError } = await service
          .from('venues')
          .insert(venueInsert)
          .select('id')
          .single<{ id: string }>();
        if (insertVenueError) throw insertVenueError;
        venueId = insertedVenue.id;
      }
    }

    if (!venueId) {
      return NextResponse.json({ error: 'Unable to resolve venue.' }, { status: 400 });
    }

    const sessionInsert: {
      activity_id: string;
      venue_id: string;
      price_cents: number;
      starts_at: string;
      ends_at: string;
      created_by: string;
      description?: string | null;
    } = {
      activity_id: activityId,
      venue_id: venueId,
      price_cents: priceCents,
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString(),
      created_by: user.id,
    };

    if (typeof body.description === 'string' && body.description.trim()) {
      sessionInsert.description = body.description.trim();
    }

    const { data: sessionRow, error: sessionError } = await service
      .from('sessions')
      .insert(sessionInsert)
      .select('id')
      .single<{ id: string }>();

    if (sessionError) throw sessionError;
    if (!sessionRow?.id) {
      return NextResponse.json({ error: 'Session creation returned no identifier.' }, { status: 500 });
    }

    revalidatePath('/');
    revalidatePath('/map');
    revalidatePath(`/activities/${activityId}`);
    revalidatePath(`/sessions/${sessionRow.id}`);

    return NextResponse.json({ id: sessionRow.id }, { status: 201 });
  } catch (error) {
    let message = getErrorMessage(error);
    if (/row-level security/i.test(message)) {
      message = 'Creation blocked by Supabase Row-Level Security. Update your policies to allow inserts for authenticated users.';
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

