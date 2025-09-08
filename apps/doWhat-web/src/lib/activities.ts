import { db, ActivityRow } from '@/lib/db';

export type UpsertActivityInput = Partial<ActivityRow> & {
  name: string
  lat?: number | null
  lng?: number | null
};

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

  // Try to find an existing record by name and close coordinates
  let existing: ActivityRow | null = null;
  {
    const { data } = await supabase
      .from('activities')
      .select('*')
      .ilike('name', input.name)
      .limit(10);
    if (data && data.length) {
      for (const row of data as ActivityRow[]) {
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
    const { data, error } = await supabase.from('activities').insert(insert).select('*').single();
    if (error) throw error;
    return { action: 'inserted', activity: data as ActivityRow };
  }

  // Merge metadata into existing
  const merged: Partial<ActivityRow> = { id: existing.id } as any;
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

  const { data, error } = await supabase
    .from('activities')
    .update(merged)
    .eq('id', existing.id)
    .select('*')
    .single();
  if (error) throw error;

  return { action: 'updated', activity: data as ActivityRow };
}

