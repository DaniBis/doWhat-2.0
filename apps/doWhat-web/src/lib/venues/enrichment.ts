import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

import {
  ACTIVITY_NAMES,
  CLASSIFICATION_MODEL,
  CLASSIFICATION_TTL_MS,
} from '@/lib/venues/constants';
import type { ActivityName } from '@/lib/venues/constants';
import {
  describeProviderError,
  fetchFoursquareVenue,
  fetchGooglePlace,
  mergeExternalVenues,
  summarizeVenueText,
} from '@/lib/venues/providers';
import type { ExternalVenueRecord, VenueClassificationResult } from '@/lib/venues/types';
import type { Json, VenueRow } from '@/types/database';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_REVIEW_LENGTH = 400;
const MAX_REVIEW_COUNT = 10;
const MAX_TAGS = 5;

let cachedOpenAI: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (cachedOpenAI) return cachedOpenAI;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }
  cachedOpenAI = new OpenAI({ apiKey });
  return cachedOpenAI;
}

const VALID_ACTIVITY_SET = new Set<ActivityName>(ACTIVITY_NAMES);

type ServiceClient = SupabaseClient;
type VenueUpdate = Partial<VenueRow>;

type EnrichmentOptions = {
  supabase: ServiceClient;
  venueId: string;
  foursquareId?: string | null;
  googlePlaceId?: string | null;
  force?: boolean;
};

type EnrichmentResult = {
  venue: VenueRow;
  classification?: VenueClassificationResult;
  externalRecord?: ExternalVenueRecord | null;
  providerDiagnostics: string[];
  refreshed: boolean;
};

export async function enrichVenueActivities(options: EnrichmentOptions): Promise<EnrichmentResult> {
  const { supabase, venueId, foursquareId, googlePlaceId, force } = options;

  const { data: existing, error: fetchError } = await supabase
    .from('venues')
    .select('*')
    .eq('id', venueId)
    .single<VenueRow>();
  if (fetchError) throw fetchError;
  if (!existing) {
    throw new Error(`Venue ${venueId} not found.`);
  }

  const lastUpdateMs = existing.last_ai_update ? Date.parse(existing.last_ai_update) : 0;
  const classificationExpired = !lastUpdateMs || Date.now() - lastUpdateMs > CLASSIFICATION_TTL_MS;
  const missingTags = !Array.isArray(existing.ai_activity_tags) || existing.ai_activity_tags.length === 0;
  const shouldClassify = Boolean(force) || classificationExpired || missingTags;

  const providerDiagnostics: string[] = [];
  const providerRecords: ExternalVenueRecord[] = [];

  if (foursquareId) {
    try {
      const record = await fetchFoursquareVenue({ supabase, fsqId: foursquareId, venueId, force });
      if (record) {
        providerRecords.push(record);
        providerDiagnostics.push('foursquare:hit');
      } else {
        providerDiagnostics.push('foursquare:miss');
      }
    } catch (error) {
      providerDiagnostics.push(describeProviderError('foursquare', error));
    }
  }

  if (googlePlaceId) {
    try {
      const record = await fetchGooglePlace({ supabase, placeId: googlePlaceId, venueId, force });
      if (record) {
        providerRecords.push(record);
        providerDiagnostics.push('google:hit');
      } else {
        providerDiagnostics.push('google:miss');
      }
    } catch (error) {
      providerDiagnostics.push(describeProviderError('google', error));
    }
  }

  const mergedRecord = mergeExternalVenues(providerRecords);
  const { rawDescription: providerDescription, rawReviews: providerReviews } = summarizeVenueText(mergedRecord);

  const normalizedDescription = normalizeDescription(providerDescription ?? existing.raw_description ?? null);
  const normalizedReviews = normalizeReviews(providerReviews?.length ? providerReviews : existing.raw_reviews ?? null);

  const metadataPatch = buildMetadataPatch(existing.metadata ?? null, mergedRecord);

  const updatePayload: VenueUpdate = {};
  let refreshed = false;

  if (normalizedDescription && normalizedDescription !== (existing.raw_description ?? null)) {
    updatePayload.raw_description = normalizedDescription;
  }

  if (hasArrayDiff(normalizedReviews, existing.raw_reviews)) {
    updatePayload.raw_reviews = normalizedReviews;
  }

  if (mergedRecord?.lat != null && (existing.lat == null || force)) {
    updatePayload.lat = mergedRecord.lat;
  }
  if (mergedRecord?.lng != null && (existing.lng == null || force)) {
    updatePayload.lng = mergedRecord.lng;
  }

  if (metadataPatch) {
    updatePayload.metadata = metadataPatch;
  }

  let classification: VenueClassificationResult | undefined;
  if (shouldClassify) {
    const classificationInput = buildClassifierInput({
      venueName: existing.name ?? 'Untitled venue',
      description: normalizedDescription,
      reviews: normalizedReviews ?? undefined,
      keywords: mergedRecord?.keywords ?? [],
      existingTags: filterActivityNames(existing.ai_activity_tags),
      verifiedTags: filterActivityNames(existing.verified_activities),
    });

    if (classificationInput) {
      classification = await classifyVenue(classificationInput);
      if (classification.tags.length) {
        updatePayload.ai_activity_tags = classification.tags;
        updatePayload.ai_confidence_scores = classification.confidence;
        updatePayload.last_ai_update = classification.timestamp;
        const verifiedSet = new Set(filterActivityNames(existing.verified_activities));
        const needsVerification = classification.tags.some((tag) => !verifiedSet.has(tag));
        updatePayload.needs_verification = needsVerification;
      } else {
        providerDiagnostics.push('classification:return-empty');
      }
    } else {
      providerDiagnostics.push('classification:skipped-no-text');
    }
  } else {
    providerDiagnostics.push('classification:skipped-up-to-date');
  }

  if (Object.keys(updatePayload).length > 0) {
    const { data: updated, error: updateError } = await supabase
      .from('venues')
      .update(updatePayload)
      .eq('id', venueId)
      .select('*')
      .single<VenueRow>();
    if (updateError) throw updateError;
    refreshed = true;
    return { venue: updated, classification, externalRecord: mergedRecord, providerDiagnostics, refreshed };
  }

  return { venue: existing, classification, externalRecord: mergedRecord, providerDiagnostics, refreshed };
}

type ClassifierInput = {
  venueName: string;
  description: string | null;
  reviews?: string[];
  keywords: string[];
  existingTags: ActivityName[];
  verifiedTags: ActivityName[];
};

function buildClassifierInput(input: ClassifierInput): ClassifierInput | null {
  const hasDescription = Boolean(input.description && input.description.trim());
  const hasReviews = Boolean(input.reviews?.length);
  if (!hasDescription && !hasReviews) {
    return null;
  }
  return {
    ...input,
    description: input.description,
    reviews: input.reviews?.length ? input.reviews : undefined,
  };
}

async function classifyVenue(input: ClassifierInput): Promise<VenueClassificationResult> {
  const client = getOpenAIClient();
  const allowedActivities = ACTIVITY_NAMES.join(', ');
  const reviewBlock = input.reviews?.length
    ? input.reviews.map((review, index) => `${index + 1}. ${review}`).join('\n')
    : 'None provided.';
  const keywordBlock = input.keywords.length ? input.keywords.join(', ') : 'None provided.';
  const prompt = [
    'You are an activity classification engine. Use the provided context to decide which activities a venue supports.',
    `Allowed activities (use only these labels): ${allowedActivities}.`,
    'Return STRICT JSON with the shape {"tags": string[], "confidence": Record<string, number>}. Tags must be ordered by descending confidence and you may return at most five.',
    `Venue Name: ${input.venueName}`,
    input.description ? `Description:\n${input.description}` : 'Description: None provided.',
    `Keywords: ${keywordBlock}`,
    `Reviews:\n${reviewBlock}`,
    input.existingTags.length ? `Existing model tags: ${input.existingTags.join(', ')}` : 'Existing model tags: none.',
    input.verifiedTags.length ? `Verified by users: ${input.verifiedTags.join(', ')}` : 'Verified by users: none.',
    'If there is no evidence for any activity, return an empty array for tags.',
  ].join('\n\n');

  const response = await client.responses.create({
    model: CLASSIFICATION_MODEL,
    input: prompt,
  });

  const text = extractResponseText(response);
  const parsed = parseClassificationPayload(text);
  return normalizeClassification(parsed);
}

type RawClassificationPayload = {
  tags?: string[];
  confidence?: Record<string, number>;
};

function parseClassificationPayload(text: string): RawClassificationPayload {
  try {
    return JSON.parse(text) as RawClassificationPayload;
  } catch (error) {
    throw new Error(`Failed to parse classification response: ${getErrorMessage(error)} :: ${text}`);
  }
}

function normalizeClassification(payload: RawClassificationPayload): VenueClassificationResult {
  const timestamp = new Date().toISOString();
  const normalizedTags: ActivityName[] = [];
  const normalizedConfidence: Record<ActivityName, number> = Object.create(null);

  (payload.tags ?? []).forEach((tag) => {
    const activity = toActivityName(tag);
    if (activity && !normalizedTags.includes(activity)) {
      normalizedTags.push(activity);
    }
  });

  if (normalizedTags.length > MAX_TAGS) {
    normalizedTags.splice(MAX_TAGS);
  }

  normalizedTags.forEach((tag) => {
    const score = clampScore(resolveConfidence(payload.confidence, tag));
    if (score != null) {
      normalizedConfidence[tag] = score;
    }
  });

  if (Object.keys(normalizedConfidence).length === 0) {
    normalizedTags.forEach((tag, index) => {
      const fallbackScore = Number(((normalizedTags.length - index) / normalizedTags.length).toFixed(3));
      normalizedConfidence[tag] = fallbackScore;
    });
  }

  return { tags: normalizedTags, confidence: normalizedConfidence, timestamp };
}

function resolveConfidence(source: RawClassificationPayload['confidence'], tag: ActivityName): number | null {
  if (!source) return null;
  const candidates = [tag, tag.toLowerCase(), tag.replace(/\s+/g, '_')];
  for (const key of candidates) {
    const value = source[key];
    if (value == null) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
}

function clampScore(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const clamped = Math.min(1, Math.max(0, value));
  return Number(clamped.toFixed(3));
}

function normalizeDescription(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_DESCRIPTION_LENGTH ? trimmed.slice(0, MAX_DESCRIPTION_LENGTH) : trimmed;
}

function normalizeReviews(values: string[] | null): string[] | null {
  if (!values?.length) return null;
  const cleaned = values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, MAX_REVIEW_COUNT)
    .map((value) => (value.length > MAX_REVIEW_LENGTH ? value.slice(0, MAX_REVIEW_LENGTH) : value));
  return cleaned.length ? cleaned : null;
}

function hasArrayDiff(next: string[] | null, prev: string[] | null): boolean {
  if (!next || !next.length) return false;
  const prevKey = JSON.stringify(prev ?? []);
  const nextKey = JSON.stringify(next);
  return prevKey !== nextKey;
}

function extractResponseText(response: unknown): string {
  const outputText = (response as { output_text?: string[] })?.output_text;
  if (Array.isArray(outputText) && outputText.length) {
    return outputText.join('\n').trim();
  }

  const output = (response as { output?: Array<{ content?: Array<{ text?: string | Array<{ text?: string }> }> }> }).output;
  if (Array.isArray(output)) {
    for (const block of output) {
      if (!Array.isArray(block?.content)) continue;
      for (const chunk of block.content) {
        const flattened = flattenTextChunk(chunk);
        if (flattened) return flattened;
      }
    }
  }

  throw new Error('OpenAI response did not contain text output.');
}

function flattenTextChunk(chunk: unknown): string {
  if (!chunk) return '';
  const typed = chunk as { text?: string | Array<{ text?: string }> };
  if (typeof typed.text === 'string') {
    return typed.text.trim();
  }
  if (Array.isArray(typed.text)) {
    return typed.text.map((item) => (item?.text ?? '')).join('').trim();
  }
  return '';
}

function filterActivityNames(values?: string[] | null): ActivityName[] {
  if (!values?.length) return [];
  const result: ActivityName[] = [];
  values.forEach((value) => {
    const activity = toActivityName(value);
    if (activity && !result.includes(activity)) {
      result.push(activity);
    }
  });
  return result;
}

function toActivityName(value?: string | null): ActivityName | null {
  if (!value) return null;
  const lowered = value.toLowerCase();
  for (const name of VALID_ACTIVITY_SET) {
    if (name.toLowerCase() === lowered) {
      return name;
    }
  }
  return null;
}

type DiscoveryMetadataPatch = {
  categories?: string[];
  keywords?: string[];
  rating?: number | null;
  priceLevel?: number | null;
  photos?: string[];
  address?: {
    formatted?: string | null;
    locality?: string | null;
    region?: string | null;
    country?: string | null;
    postcode?: string | null;
  };
  timezone?: string | null;
  openNow?: boolean | null;
  hoursSummary?: string | null;
  hours?: Record<string, unknown> | null;
};

function buildMetadataPatch(existing: Json | null, record: ExternalVenueRecord | null): Json | null {
  if (!record) return null;
  const patch: DiscoveryMetadataPatch = {};
  if (record.categories?.length) patch.categories = record.categories;
  if (record.keywords?.length) patch.keywords = record.keywords;
  if (typeof record.rating === 'number') patch.rating = record.rating;
  if (typeof record.priceLevel === 'number') patch.priceLevel = record.priceLevel;
  if (record.photos?.length) patch.photos = record.photos;
  if (record.address || record.locality || record.region || record.country || record.postcode) {
    patch.address = {
      formatted: record.address ?? null,
      locality: record.locality ?? null,
      region: record.region ?? null,
      country: record.country ?? null,
      postcode: record.postcode ?? null,
    };
  }
  if (typeof record.openNow === 'boolean') {
    patch.openNow = record.openNow;
  }
  if (typeof record.hoursSummary === 'string' && record.hoursSummary.trim()) {
    patch.hoursSummary = record.hoursSummary.trim();
  }
  if (record.hours) {
    patch.hours = record.hours;
  }
  if (typeof record.timezone === 'string' && record.timezone.trim()) {
    patch.timezone = record.timezone.trim();
  }
  if (Object.keys(patch).length === 0) return null;
  return mergeDiscoveryMetadata(existing, patch);
}

function mergeDiscoveryMetadata(existing: Json | null, patch: DiscoveryMetadataPatch): Json {
  const base = isJsonObject(existing) ? { ...existing } : {};
  const prevDiscovery = isJsonObject(base.discovery) ? { ...(base.discovery as Record<string, unknown>) } : {};
  const nextDiscovery = {
    ...prevDiscovery,
    ...(patch.categories ? { categories: patch.categories } : {}),
    ...(patch.keywords ? { keywords: patch.keywords } : {}),
    ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
    ...(patch.priceLevel !== undefined ? { priceLevel: patch.priceLevel } : {}),
    ...(patch.photos ? { photos: patch.photos } : {}),
    ...(patch.address
      ? {
          address: {
            ...(isJsonObject(prevDiscovery.address) ? (prevDiscovery.address as Record<string, unknown>) : {}),
            ...patch.address,
          },
        }
      : {}),
    ...(patch.timezone ? { timezone: patch.timezone } : {}),
    ...(patch.openNow !== undefined ? { openNow: patch.openNow } : {}),
    ...(patch.hoursSummary ? { hoursSummary: patch.hoursSummary } : {}),
    ...(patch.hours ? { hours: patch.hours } : {}),
  };
  return { ...base, discovery: nextDiscovery } as Json;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}