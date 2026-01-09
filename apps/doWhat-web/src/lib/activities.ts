import { db, ActivityRow } from '@/lib/db';
import { resolvePlaceFromCoords } from '@/lib/places/resolver';

export type UpsertActivityInput = Partial<ActivityRow> & {
  name: string
  lat?: number | null
  lng?: number | null
  place_id?: string | null
};

const ACTIVITY_SELECT_COLUMNS = [
  'id',
  'name',
  'description',
  'venue',
  'activity_types',
  'tags',
  'phone_text',
  'opening_hours',
  'photos',
  'external_urls',
  'rating',
  'rating_count',
  'price_cents',
  'lat',
  'lng',
  'place_id',
  'geom',
  'created_at',
  'updated_at',
].join(',');

function normName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function near(a?: number | null, b?: number | null, maxMeters = 25): boolean {
  if (a == null || b == null) return false;
  const diff = Math.abs(a - b);
  // quick conversion: ~111_320m per degree latitude
  const meters = diff * 111_320;
  return meters <= maxMeters;
}

function mergeArray<T>(base?: T[] | null, extra?: T[] | null): T[] | null {
  const set = new Set([...(base ?? []), ...(extra ?? [])]);
  return set.size ? Array.from(set) : null;
}

export async function upsertActivity(input: UpsertActivityInput) {
  const supabase = db();
  const nameKey = normName(input.name);
  const hasCoordinates = typeof input.lat === 'number' && Number.isFinite(input.lat) && typeof input.lng === 'number' && Number.isFinite(input.lng);
  let cachedResolvedPlace: Awaited<ReturnType<typeof resolvePlaceFromCoords>> | null = null;
  const ensureResolvedPlace = async () => {
    if (cachedResolvedPlace || !hasCoordinates) return cachedResolvedPlace;
    cachedResolvedPlace = await resolvePlaceFromCoords({
      lat: input.lat!,
      lng: input.lng!,
      labelHint: input.venue ?? input.name,
      source: 'activity-upsert',
    });
    return cachedResolvedPlace;
  };

  // Try to find an existing record by name and close coordinates
  let existing: ActivityRow | null = null;
  {
    const { data } = await supabase
      .from('activities')
      .select(ACTIVITY_SELECT_COLUMNS)
      .ilike('name', input.name)
      .limit(10)
      .returns<ActivityRow[]>();
    if (data && data.length) {
      for (const row of data) {
        if (
          input.lat != null && input.lng != null &&
          near(row.lat ?? null, input.lat ?? null, 50) &&
          near(row.lng ?? null, input.lng ?? null, 50)
        ) {
          existing = row;
          break;
        }
        if (normName(row.name) === nameKey) {
          existing = row;
          break;
        }
      }
    }
  }

  if (!existing) {
    const resolvedPlace = input.place_id ? null : await ensureResolvedPlace();
    const insertPlaceId = input.place_id ?? resolvedPlace?.placeId ?? null;
    // Insert new
    const insert: Partial<ActivityRow> = {
      name: input.name,
      description: input.description ?? null,
      venue: input.venue ?? null,
      activity_types: input.activity_types ?? null,
      tags: input.tags ?? null,
      phone_text: input.phone_text ?? null,
      opening_hours: input.opening_hours ?? null,
      photos: input.photos ?? null,
      external_urls: input.external_urls ?? null,
      rating: input.rating ?? null,
      rating_count: input.rating_count ?? null,
      price_cents: input.price_cents ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    };
    if (insertPlaceId) insert.place_id = insertPlaceId;
    const { data, error } = await supabase
      .from('activities')
      .insert(insert)
      .select(ACTIVITY_SELECT_COLUMNS)
      .single<ActivityRow>();
    if (error) throw error;
    return { action: 'inserted', activity: data };
  }

  // Merge metadata into existing
  const merged: Partial<ActivityRow> = { id: existing.id };
  const prefer = <T>(oldVal: T | null | undefined, newVal: T | null | undefined) =>
    newVal != null && (Array.isArray(newVal) ? newVal.length > 0 : true) ? newVal : oldVal ?? null;

  merged.description = prefer(existing.description ?? null, input.description ?? null);
  merged.venue = prefer(existing.venue ?? null, input.venue ?? null);
  merged.activity_types = mergeArray(existing.activity_types ?? null, input.activity_types ?? null);
  merged.tags = mergeArray(existing.tags ?? null, input.tags ?? null);
  merged.phone_text = prefer(existing.phone_text ?? null, input.phone_text ?? null);
  merged.opening_hours = prefer(existing.opening_hours ?? null, input.opening_hours ?? null);
  merged.photos = prefer(existing.photos ?? null, input.photos ?? null);
  merged.external_urls = mergeArray(existing.external_urls ?? null, input.external_urls ?? null);
  merged.rating = prefer(existing.rating ?? null, input.rating ?? null);
  merged.rating_count = prefer(existing.rating_count ?? null, input.rating_count ?? null);
  merged.price_cents = prefer(existing.price_cents ?? null, input.price_cents ?? null);
  merged.lat = prefer(existing.lat ?? null, input.lat ?? null);
  merged.lng = prefer(existing.lng ?? null, input.lng ?? null);

  const needsPlaceUpdate = !existing.place_id || input.place_id;
  if (needsPlaceUpdate) {
    const resolvedPlace = existing.place_id ? null : await ensureResolvedPlace();
    const nextPlaceId = input.place_id ?? existing.place_id ?? resolvedPlace?.placeId ?? null;
    if (nextPlaceId && nextPlaceId !== existing.place_id) {
      merged.place_id = nextPlaceId;
    }
  }

  const { data, error } = await supabase
    .from('activities')
    .update(merged)
    .eq('id', existing.id)
    .select(ACTIVITY_SELECT_COLUMNS)
    .single<ActivityRow>();
  if (error) throw error;

  return { action: 'updated', activity: data };
}
