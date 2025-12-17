import { fetchOverpassPlaceSummaries } from '@dowhat/shared';
import { supabase } from './supabase';

export interface PlaceSuggestion {
	id: string;
	name: string;
	address?: string | null;
	lat: number;
	lng: number;
	categories: string[];
}

export interface FetchNearbyPlacesOptions {
	lat: number;
	lng: number;
	radiusMeters?: number;
	limit?: number;
	signal?: AbortSignal;
}

type VenueRow = {
	id: string | null;
	name: string | null;
	address: string | null;
	lat: number | null;
	lng: number | null;
	verified_activities: string[] | null;
	ai_activity_tags: string[] | null;
	updated_at?: string | null;
};

const sanitizeCoordinate = (value: unknown): number | null => {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

const METERS_PER_DEGREE = 111_000;
const MIN_RADIUS_METERS = 100;
const SAMPLE_MULTIPLIER = 4;
const MAX_SAMPLE_SIZE = 60;

const fetchFromSupabase = async (
	lat: number,
	lng: number,
	radiusMeters: number,
	limit: number,
): Promise<PlaceSuggestion[]> => {
	const delta = Math.max(radiusMeters, MIN_RADIUS_METERS) / METERS_PER_DEGREE;
	const sw = { lat: lat - delta, lng: lng - delta };
	const ne = { lat: lat + delta, lng: lng + delta };
	const queryLimit = Math.min(Math.max(limit * SAMPLE_MULTIPLIER, limit), MAX_SAMPLE_SIZE);

	const { data, error } = await supabase
		.from('venues')
		.select('id,name,address,lat,lng,verified_activities,ai_activity_tags,updated_at')
		.gte('lat', sw.lat)
		.lte('lat', ne.lat)
		.gte('lng', sw.lng)
		.lte('lng', ne.lng)
		.order('updated_at', { ascending: false })
		.limit(queryLimit);

	if (error) throw error;

	const rows = (data as VenueRow[] | null) ?? [];
	const deduped = new Map<string, { score: number; place: PlaceSuggestion }>();

	rows.forEach((row) => {
		if (!row?.id || !row?.name) return;
		const latValue = sanitizeCoordinate(row.lat);
		const lngValue = sanitizeCoordinate(row.lng);
		if (latValue == null || lngValue == null) return;
		const categories = Array.isArray(row.verified_activities) && row.verified_activities.length > 0
			? row.verified_activities
			: Array.isArray(row.ai_activity_tags)
				? row.ai_activity_tags
				: [];
		const recency = row.updated_at ? new Date(row.updated_at).getTime() : 0;
		const score = (categories.length ? 2 : 0) + (row.address ? 0.5 : 0) + recency / 1_000_000_000;
		if (!deduped.has(row.id) || deduped.get(row.id)!.score < score) {
			deduped.set(row.id, {
				score,
				place: {
					id: row.id,
					name: row.name,
					lat: latValue,
					lng: lngValue,
					address: row.address ?? null,
					categories,
				},
			});
		}
	});

	return Array.from(deduped.values())
		.sort((a, b) => b.score - a.score)
		.map((entry) => entry.place)
		.slice(0, limit);
};

export async function fetchNearbyPlaces(options: FetchNearbyPlacesOptions): Promise<PlaceSuggestion[]> {
	const { lat, lng, radiusMeters = 5000, limit = 5, signal } = options;

	try {
		const places = await fetchFromSupabase(lat, lng, radiusMeters, limit);
		if (places.length > 0) {
			return places;
		}
		throw new Error('No venues returned from Supabase');
	} catch (primaryError) {
		if (__DEV__) {
			console.info('[placesSearch] Supabase venues query failed, trying Overpass fallback', primaryError);
		}
		try {
			const fallbackSummaries = await fetchOverpassPlaceSummaries({
				lat,
				lng,
				radiusMeters,
				limit,
				signal,
			});
			if (fallbackSummaries.length > 0) {
				return fallbackSummaries
					.map((place): PlaceSuggestion => ({
						id: place.id,
						name: place.name,
						lat: place.lat,
						lng: place.lng,
						address: place.address ?? null,
						categories: Array.isArray(place.categories) ? place.categories : [],
					}))
					.slice(0, limit);
			}
		} catch (fallbackError) {
			if (__DEV__) {
				console.info('[placesSearch] Overpass fallback failed', fallbackError);
			}
			throw fallbackError instanceof Error ? fallbackError : new Error('Nearby places unavailable.');
		}

		if (primaryError instanceof Error) {
			throw primaryError;
		}
		throw new Error('Nearby places unavailable.');
	}
}
