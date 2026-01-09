import { NextResponse } from 'next/server';

import { normalizeEventState } from '@/lib/events/state';
import { hydratePlaceLabel, normalizePlaceLabel, PLACE_FALLBACK_LABEL } from '@/lib/places/labels';
import { isMissingColumnError } from '@/lib/supabase/errors';
import { createServiceClient } from '@/lib/supabase/service';

const PLACE_SELECTION = 'id,name,lat,lng,address,locality,region,country,categories';
const MAX_QUERY_ATTEMPTS = 6;

type EventRow = {
  id: string;
  title?: string | null;
  description: string | null;
  start_at: string;
  end_at: string | null;
  timezone: string | null;
  venue_name?: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  url: string | null;
  image_url: string | null;
  status?: string | null;
  tags: string[] | null;
  place_id: string | null;
  source_id: string | null;
  source_uid: string | null;
  metadata: Record<string, unknown> | null;
  event_state?: string | null;
};

const fetchPlace = async (client: ReturnType<typeof createServiceClient>, placeId: string | null) => {
  if (!placeId) return null;
  const { data, error } = await client
    .from('places')
    .select(PLACE_SELECTION)
    .eq('id', placeId)
    .maybeSingle();
  if (error) {
    console.warn('[event-detail-api] place lookup failed', error.message);
    return null;
  }
  return data ?? null;
};

const BASE_EVENT_COLUMNS = [
  'id',
  'title',
  'description',
  'start_at',
  'end_at',
  'timezone',
  'venue_name',
  'lat',
  'lng',
  'address',
  'url',
  'image_url',
  'status',
  'tags',
  'place_id',
  'source_id',
  'source_uid',
  'metadata',
  'event_state',
];

const buildEventSelection = (options: {
  aliasTitle: boolean;
  omitTitle: boolean;
  omitVenueName: boolean;
  omitPlaceId: boolean;
  omitEventState: boolean;
}) =>
  BASE_EVENT_COLUMNS.filter((column) => {
    if (options.omitTitle && column === 'title') return false;
    if (options.omitVenueName && column === 'venue_name') return false;
    if (options.omitPlaceId && column === 'place_id') return false;
    if (options.omitEventState && column === 'event_state') return false;
    return true;
  })
    .map((column) => {
      if (column === 'title' && options.aliasTitle) {
        return 'title:normalized_title';
      }
      return column;
    })
    .join(',');

export async function GET(_request: Request, context: { params: { id: string } }) {
  const { id } = context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing event id' }, { status: 400 });
  }

  const client = createServiceClient();
  let data: EventRow | null = null;
  let error: { message?: string | null } | null = null;
  let aliasTitle = false;
  let omitTitle = false;
  let omitVenueName = false;
  let omitPlaceId = false;
  let omitEventState = false;

  for (let attempt = 0; attempt < MAX_QUERY_ATTEMPTS; attempt += 1) {
    const selection = buildEventSelection({
      aliasTitle,
      omitTitle,
      omitVenueName,
      omitPlaceId,
      omitEventState,
    });
    const result = await client.from('events').select(selection).eq('id', id).maybeSingle();
    data = (result.data as EventRow | null) ?? null;
    error = result.error;
    if (!error) break;

    const message = error.message ?? '';

    if (!omitTitle && !aliasTitle && isMissingColumnError(message, 'title')) {
      aliasTitle = true;
      // eslint-disable-next-line no-console
      console.warn('[event-detail-api] missing title column, retrying with normalized_title alias');
      continue;
    }

    if (aliasTitle && isMissingColumnError(message, 'normalized_title')) {
      aliasTitle = false;
      omitTitle = true;
      // eslint-disable-next-line no-console
      console.warn('[event-detail-api] missing both title and normalized_title columns, retrying without title');
      continue;
    }

    if (!omitVenueName && isMissingColumnError(message, 'venue_name')) {
      omitVenueName = true;
      // eslint-disable-next-line no-console
      console.warn('[event-detail-api] missing venue_name column, retrying without it');
      continue;
    }

    if (!omitPlaceId && isMissingColumnError(message, 'place_id')) {
      omitPlaceId = true;
      // eslint-disable-next-line no-console
      console.warn('[event-detail-api] missing place_id column, retrying without it');
      continue;
    }

    if (!omitEventState && isMissingColumnError(message, 'event_state')) {
      omitEventState = true;
      // eslint-disable-next-line no-console
      console.warn('[event-detail-api] missing event_state column, retrying without it');
      continue;
    }

    break;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const placeId = typeof data.place_id === 'string' ? data.place_id : null;
  const place = await fetchPlace(client, placeId);
  const placeLabel = hydratePlaceLabel({
    place,
    venue_name: data.venue_name ?? null,
    address: data.address ?? null,
  });
  const title = normalizePlaceLabel(
    data.title,
    placeLabel === PLACE_FALLBACK_LABEL ? null : placeLabel,
    data.venue_name ?? null,
    'Event',
  );
  const event = {
    ...data,
    title,
    place_id: placeId,
    event_state: normalizeEventState(omitEventState ? null : data.event_state),
    place_label: placeLabel,
    place,
  };

  return NextResponse.json({ event });
}
