import { haversineMeters } from '@/lib/places/utils';

import type { EventSourceRow, EventUpsertRecord, Json } from './types';

const LOCATION_MATCH_DISTANCE_METERS = 300;
const REQUIRED_CONFIRMATIONS = 2;
const HIGH_ACCURACY_THRESHOLD = 95;

type VerificationEvidence = {
  sourceId: string | null;
  sourceUrl: string | null;
  sourceType: EventSourceRow['type'] | null;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
};

export type VerificationIndex = Map<string, VerificationEvidence[]>;

const toStringArray = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
};

const locationsMatch = (a: VerificationEvidence, b: VerificationEvidence): boolean => {
  if (a.placeId && b.placeId) {
    return a.placeId === b.placeId;
  }
  if (
    typeof a.lat === 'number' &&
    Number.isFinite(a.lat) &&
    typeof a.lng === 'number' &&
    Number.isFinite(a.lng) &&
    typeof b.lat === 'number' &&
    Number.isFinite(b.lat) &&
    typeof b.lng === 'number' &&
    Number.isFinite(b.lng)
  ) {
    return haversineMeters(a.lat, a.lng, b.lat, b.lng) <= LOCATION_MATCH_DISTANCE_METERS;
  }
  return false;
};

const metadataRecord = (record: EventUpsertRecord): Record<string, Json> => {
  if (!record.metadata || typeof record.metadata !== 'object') return {};
  return { ...record.metadata };
};

const recordEvidence = (record: EventUpsertRecord, source: EventSourceRow): VerificationEvidence => ({
  sourceId: record.source_id ?? source.id ?? null,
  sourceUrl: typeof source.url === 'string' ? source.url : null,
  sourceType: source.type ?? null,
  placeId: record.place_id ?? null,
  lat: record.lat ?? null,
  lng: record.lng ?? null,
});

const findSourceKey = (evidence: VerificationEvidence): string =>
  evidence.sourceId ?? evidence.sourceUrl ?? 'unknown-source';

const sourceTypeQuality = (value: EventSourceRow['type'] | null | undefined): number => {
  if (value === 'ics') return 0.97;
  if (value === 'jsonld') return 0.95;
  if (value === 'rss') return 0.9;
  return 0.85;
};

const computeAccuracyScore = (
  evidence: VerificationEvidence,
  matched: VerificationEvidence[],
): number => {
  const distinctSourceCount = 1 + new Set(matched.map(findSourceKey)).size;
  const hasPlaceBackedAgreement =
    Boolean(evidence.placeId)
    && matched.some((candidate) => Boolean(candidate.placeId) && candidate.placeId === evidence.placeId);
  const qualitySignals = [sourceTypeQuality(evidence.sourceType), ...matched.map((candidate) => sourceTypeQuality(candidate.sourceType))];
  const averageQuality = qualitySignals.length
    ? qualitySignals.reduce((sum, value) => sum + value, 0) / qualitySignals.length
    : 0.85;

  const base = evidence.placeId ? 72 : 58;
  const corroborationBonus = Math.min(18, (distinctSourceCount - 1) * 12);
  const sourceQualityBonus = Math.round(averageQuality * 10);
  const canonicalPlaceBonus = hasPlaceBackedAgreement ? 8 : 0;
  const score = base + corroborationBonus + sourceQualityBonus + canonicalPlaceBonus;
  return Math.max(0, Math.min(100, score));
};

export const createVerificationIndex = (): VerificationIndex => new Map<string, VerificationEvidence[]>();

export const annotateLocationVerification = (
  records: EventUpsertRecord[],
  source: EventSourceRow,
  index: VerificationIndex,
): {
  records: EventUpsertRecord[];
  verifiedCount: number;
  pendingCount: number;
} => {
  let verifiedCount = 0;
  let pendingCount = 0;

  const sourceSeenByDedupe = new Map<string, VerificationEvidence[]>();
  const updated = records.map((record) => {
    const evidence = recordEvidence(record, source);
    const historical = index.get(record.dedupe_key) ?? [];
    const sameRun = sourceSeenByDedupe.get(record.dedupe_key) ?? [];
    const candidates = [...historical, ...sameRun];

    const matched = candidates.filter((candidate) => {
      const candidateKey = findSourceKey(candidate);
      const currentKey = findSourceKey(evidence);
      if (candidateKey === currentKey) return false;
      return locationsMatch(candidate, evidence);
    });

    const matchedSources = Array.from(new Set(matched.map(findSourceKey)));
    const confirmations = 1 + matchedSources.length;
    const accuracyScore = computeAccuracyScore(evidence, matched);
    const confirmed = confirmations >= REQUIRED_CONFIRMATIONS && accuracyScore >= HIGH_ACCURACY_THRESHOLD;

    const existingMetadata = metadataRecord(record);
    const existingEvidence = toStringArray(existingMetadata.locationEvidenceSources);
    const nextEvidence = Array.from(
      new Set([
        ...existingEvidence,
        ...matched
          .map((candidate) => candidate.sourceUrl)
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
        source.url,
      ]),
    );

    const locationVerification: Record<string, Json> = {
      checkedAt: new Date().toISOString(),
      confirmed,
      accuracyScore,
      confirmations,
      required: REQUIRED_CONFIRMATIONS,
      matchedSources,
      rule: `same place_id OR <= ${LOCATION_MATCH_DISTANCE_METERS}m`,
      threshold: HIGH_ACCURACY_THRESHOLD,
    };

    if (confirmed) {
      verifiedCount += 1;
    } else {
      pendingCount += 1;
    }

    const updatedRecord: EventUpsertRecord = {
      ...record,
      metadata: {
        ...existingMetadata,
        locationVerification,
        locationEvidenceSources: nextEvidence,
      },
    };

    sourceSeenByDedupe.set(record.dedupe_key, [...sameRun, evidence]);
    return updatedRecord;
  });

  for (const record of updated) {
    const evidence = recordEvidence(record, source);
    const prior = index.get(record.dedupe_key) ?? [];
    index.set(record.dedupe_key, [...prior, evidence]);
  }

  return {
    records: updated,
    verifiedCount,
    pendingCount,
  };
};
