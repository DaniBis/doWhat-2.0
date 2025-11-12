import { createServiceClient } from '@/lib/supabase/service';
import { ensureArray } from '@/lib/places/utils';
import type { PlaceProvider } from '@/lib/places/types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = {
  params: { id: string };
};

export async function GET(_request: Request, { params }: Params) {
  const identifier = params.id;
  if (!identifier) {
    return Response.json({ error: 'Missing place id' }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    const isUuid = UUID_REGEX.test(identifier);

    const selectQuery = service
      .from('places')
      .select(
        `id, slug, name, categories, tags, address, locality, region, country, postcode, lat, lng, phone, website, rating, rating_count, price_level, popularity_score, aggregated_from, primary_source, attribution, metadata, cached_at, cache_expires_at, last_seen_at, place_sources:place_sources(id, provider, provider_place_id, fetched_at, confidence, name, categories, lat, lng, address, url, attribution)`,
      )
      .limit(1);

    const { data, error } = isUuid
      ? await selectQuery.eq('id', identifier)
      : await selectQuery.eq('slug', identifier);

    if (error) throw error;
    const row = data?.[0];
    if (!row) {
      return Response.json({ error: 'Place not found' }, { status: 404 });
    }

    const sources = ensureArray(row.place_sources).map((source) => ({
      id: source.id,
      provider: source.provider as PlaceProvider,
      providerPlaceId: source.provider_place_id,
      fetchedAt: source.fetched_at,
      confidence: source.confidence,
      name: source.name,
      categories: ensureArray(source.categories ?? []),
      lat: source.lat,
      lng: source.lng,
      address: source.address,
      url: source.url,
      attribution: source.attribution,
    }));

    return Response.json({
      place: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        categories: ensureArray(row.categories ?? []),
        tags: ensureArray(row.tags ?? []),
        address: row.address,
        locality: row.locality,
        region: row.region,
        country: row.country,
        postcode: row.postcode,
        lat: row.lat,
        lng: row.lng,
        phone: row.phone,
        website: row.website,
        rating: row.rating,
        ratingCount: row.rating_count,
        priceLevel: row.price_level,
        popularityScore: row.popularity_score,
        aggregatedFrom: ensureArray(row.aggregated_from ?? []),
        primarySource: row.primary_source,
        attribution: row.attribution,
        metadata: row.metadata,
        cachedAt: row.cached_at,
        cacheExpiresAt: row.cache_expires_at,
        lastSeenAt: row.last_seen_at,
        sources,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load place';
    console.error('Place detail endpoint error', error);
    return Response.json({ error: message }, { status: 500 });
  }
}
