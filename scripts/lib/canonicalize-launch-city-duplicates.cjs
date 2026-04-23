const AUDIT_DUPLICATE_DISTANCE_METERS = 120;
const CANONICALIZATION_DISTANCE_METERS = 35;
const DUPLICATE_CANONICALIZATION_KEY = 'duplicate_canonicalization';
const GENERIC_DUPLICATE_NAMES = new Set(['unnamedplace', 'unnamedspot']);

const normalizeName = (value) => (value || '').trim().toLowerCase().replace(/\s+/g, '');
const normalizeTokens = (values) =>
  [...new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizeName(String(value || '')))
    .filter(Boolean))].sort();

const buildSignature = (values) => normalizeTokens(values).join('|');

const toMillis = (value) => {
  const millis = value ? Date.parse(value) : NaN;
  return Number.isFinite(millis) ? millis : 0;
};

const haversineMeters = (left, right) => {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const latDelta = toRadians(Number(right.lat) - Number(left.lat));
  const lngDelta = toRadians(Number(right.lng) - Number(left.lng));
  const leftLat = toRadians(Number(left.lat));
  const rightLat = toRadians(Number(right.lat));
  const component = Math.sin(latDelta / 2) ** 2 + Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(lngDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(component), Math.sqrt(1 - component));
};

const getDuplicateCanonicalization = (place) => {
  const metadata = place?.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = metadata[DUPLICATE_CANONICALIZATION_KEY];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
};

const isSuppressedDuplicatePlace = (place) => {
  const canonicalization = getDuplicateCanonicalization(place);
  return canonicalization?.status === 'suppressed' && typeof canonicalization.canonical_place_id === 'string';
};

const createZeroReferenceSummary = () => ({
  activities: 0,
  events: 0,
  sessions: 0,
  placeSources: 0,
  venueActivities: 0,
  manualOverrides: 0,
  userSavedActivities: 0,
});

const getReferenceSummary = (referenceSummaryByPlace, placeId) => {
  const summary = referenceSummaryByPlace.get(placeId);
  if (!summary) return createZeroReferenceSummary();
  return {
    activities: Number(summary.activities || 0),
    events: Number(summary.events || 0),
    sessions: Number(summary.sessions || 0),
    placeSources: Number(summary.placeSources || 0),
    venueActivities: Number(summary.venueActivities || 0),
    manualOverrides: Number(summary.manualOverrides || 0),
    userSavedActivities: Number(summary.userSavedActivities || 0),
  };
};

const getBlockedReferenceCount = (referenceSummary) =>
  referenceSummary.placeSources + referenceSummary.venueActivities + referenceSummary.manualOverrides + referenceSummary.userSavedActivities;

const getRewriteableReferenceCount = (referenceSummary) =>
  referenceSummary.activities + referenceSummary.events + referenceSummary.sessions;

const compareCanonicalPlaces = (left, right, referenceSummaryByPlace) => {
  const leftRefs = getReferenceSummary(referenceSummaryByPlace, left.id);
  const rightRefs = getReferenceSummary(referenceSummaryByPlace, right.id);
  const tuples = [
    [getBlockedReferenceCount(leftRefs), getBlockedReferenceCount(rightRefs)],
    [getRewriteableReferenceCount(leftRefs), getRewriteableReferenceCount(rightRefs)],
    [normalizeTokens(left.categories).length + normalizeTokens(left.tags).length, normalizeTokens(right.categories).length + normalizeTokens(right.tags).length],
    [Array.isArray(left.aggregated_from) ? left.aggregated_from.length : Array.isArray(left.aggregatedFrom) ? left.aggregatedFrom.length : 0,
      Array.isArray(right.aggregated_from) ? right.aggregated_from.length : Array.isArray(right.aggregatedFrom) ? right.aggregatedFrom.length : 0],
    [toMillis(left.updated_at ?? left.updatedAt), toMillis(right.updated_at ?? right.updatedAt)],
  ];

  for (const [leftValue, rightValue] of tuples) {
    if (leftValue !== rightValue) return rightValue - leftValue;
  }
  return left.id.localeCompare(right.id);
};

const buildDuplicateClusters = (places, options = {}) => {
  const { maxDistanceMeters = AUDIT_DUPLICATE_DISTANCE_METERS, includeSuppressed = false } = options;
  const buckets = new Map();
  const filteredPlaces = includeSuppressed ? places : places.filter((place) => !isSuppressedDuplicatePlace(place));

  filteredPlaces.forEach((place) => {
    const key = normalizeName(place.name);
    if (!key) return;
    const bucket = buckets.get(key) ?? [];
    bucket.push(place);
    buckets.set(key, bucket);
  });

  const clusters = [];
  buckets.forEach((bucket, normalizedName) => {
    if (bucket.length < 2) return;
    const visited = new Set();
    bucket.forEach((place) => {
      if (visited.has(place.id)) return;
      const cluster = [place];
      visited.add(place.id);
      bucket.forEach((candidate) => {
        if (visited.has(candidate.id)) return;
        const distanceMeters = haversineMeters(place, candidate);
        if (distanceMeters <= maxDistanceMeters) {
          cluster.push(candidate);
          visited.add(candidate.id);
        }
      });
      if (cluster.length > 1) {
        clusters.push({
          normalizedName,
          size: cluster.length,
          placeIds: cluster.map((entry) => entry.id),
          names: [...new Set(cluster.map((entry) => entry.name))],
          samples: cluster.map((entry) => ({
            placeId: entry.id,
            name: entry.name,
            lat: entry.lat,
            lng: entry.lng,
            mappedActivities: [...new Set((entry.mappings || []).map((mapping) => mapping.slug))].sort(),
          })),
        });
      }
    });
  });

  clusters.sort((left, right) => right.size - left.size || left.normalizedName.localeCompare(right.normalizedName));
  return clusters;
};

const buildSuppressedMetadata = ({ city, canonicalPlaceId, normalizedName, distanceMeters, previousMetadata }) => ({
  ...(previousMetadata && typeof previousMetadata === 'object' && !Array.isArray(previousMetadata) ? previousMetadata : {}),
  [DUPLICATE_CANONICALIZATION_KEY]: {
    ...(getDuplicateCanonicalization({ metadata: previousMetadata }) ?? {}),
    city,
    normalized_name: normalizedName,
    canonical_place_id: canonicalPlaceId,
    distance_meters: Number(distanceMeters.toFixed(1)),
    status: 'suppressed',
    strategy: 'launch_city_reference_safe',
    suppressed_at: new Date().toISOString(),
  },
});

const buildCanonicalMetadata = ({ city, canonicalPlace, mergedDuplicateIds }) => {
  const previousMetadata = canonicalPlace?.metadata;
  const existing = getDuplicateCanonicalization(canonicalPlace) ?? {};
  const mergedIds = [...new Set([...(Array.isArray(existing.merged_duplicate_ids) ? existing.merged_duplicate_ids : []), ...mergedDuplicateIds])].sort();
  return {
    ...(previousMetadata && typeof previousMetadata === 'object' && !Array.isArray(previousMetadata) ? previousMetadata : {}),
    [DUPLICATE_CANONICALIZATION_KEY]: {
      ...existing,
      city,
      status: 'canonical',
      strategy: 'launch_city_reference_safe',
      merged_duplicate_ids: mergedIds,
      last_applied_at: new Date().toISOString(),
    },
  };
};

const buildCanonicalizationPlan = ({
  city,
  places,
  referenceSummaryByPlace,
  maxDistanceMeters = CANONICALIZATION_DISTANCE_METERS,
  auditDistanceMeters = AUDIT_DUPLICATE_DISTANCE_METERS,
}) => {
  const candidatePlaces = places.filter((place) => !isSuppressedDuplicatePlace(place));
  const beforeDuplicateClusters = buildDuplicateClusters(candidatePlaces, { maxDistanceMeters: auditDistanceMeters, includeSuppressed: true });
  const buckets = new Map();

  candidatePlaces.forEach((place) => {
    const normalizedName = normalizeName(place.name);
    if (!normalizedName || GENERIC_DUPLICATE_NAMES.has(normalizedName)) return;
    const bucket = buckets.get(normalizedName) ?? [];
    bucket.push(place);
    buckets.set(normalizedName, bucket);
  });

  const candidates = [];
  const blockedClusters = [];

  buckets.forEach((bucket, normalizedName) => {
    if (bucket.length < 2) return;
    const cluster = [];
    for (const place of bucket) {
      if (!cluster.length) {
        cluster.push(place);
        continue;
      }
      if (cluster.some((entry) => haversineMeters(entry, place) <= maxDistanceMeters)) {
        cluster.push(place);
      }
    }
    if (cluster.length < 2) return;

    const sorted = [...cluster].sort((left, right) => compareCanonicalPlaces(left, right, referenceSummaryByPlace));
    const canonicalPlace = sorted[0];
    const canonicalCategorySignature = buildSignature(canonicalPlace.categories);
    const canonicalTagSignature = buildSignature(canonicalPlace.tags);
    const canonicalPrimarySource = canonicalPlace.primary_source ?? canonicalPlace.primarySource ?? null;

    const mergeableDuplicates = [];
    const blockedDuplicates = [];

    for (const duplicate of sorted.slice(1)) {
      const distanceMeters = haversineMeters(canonicalPlace, duplicate);
      const referenceSummary = getReferenceSummary(referenceSummaryByPlace, duplicate.id);
      const blockedReasons = [];
      const duplicatePrimarySource = duplicate.primary_source ?? duplicate.primarySource ?? null;
      if (distanceMeters > maxDistanceMeters) blockedReasons.push(`distance>${maxDistanceMeters}m`);
      if ((canonicalPrimarySource || duplicatePrimarySource) && canonicalPrimarySource !== duplicatePrimarySource) blockedReasons.push('primary-source-mismatch');
      if (buildSignature(duplicate.categories) !== canonicalCategorySignature) blockedReasons.push('category-signature-mismatch');
      if (buildSignature(duplicate.tags) !== canonicalTagSignature) blockedReasons.push('tag-signature-mismatch');
      if (referenceSummary.placeSources > 0) blockedReasons.push('duplicate-has-place-sources');
      if (referenceSummary.venueActivities > 0) blockedReasons.push('duplicate-has-venue-activities');
      if (referenceSummary.manualOverrides > 0) blockedReasons.push('duplicate-has-manual-overrides');
      if (referenceSummary.userSavedActivities > 0) blockedReasons.push('duplicate-has-user-saved-activities');

      const duplicatePlan = {
        duplicatePlaceId: duplicate.id,
        distanceMeters: Number(distanceMeters.toFixed(1)),
        duplicateName: duplicate.name,
        rewriteCounts: {
          activities: referenceSummary.activities,
          events: referenceSummary.events,
          sessions: referenceSummary.sessions,
        },
        referenceSummary,
      };

      if (blockedReasons.length) {
        blockedDuplicates.push({ ...duplicatePlan, blockedReasons });
        continue;
      }

      mergeableDuplicates.push({
        ...duplicatePlan,
        suppressedMetadata: buildSuppressedMetadata({
          city,
          canonicalPlaceId: canonicalPlace.id,
          normalizedName,
          distanceMeters,
          previousMetadata: duplicate.metadata,
        }),
      });
    }

    if (mergeableDuplicates.length) {
      candidates.push({
        normalizedName,
        canonicalPlace: {
          id: canonicalPlace.id,
          name: canonicalPlace.name,
          lat: canonicalPlace.lat,
          lng: canonicalPlace.lng,
          metadata: canonicalPlace.metadata,
          rewriteCounts: getReferenceSummary(referenceSummaryByPlace, canonicalPlace.id),
        },
        mergeableDuplicates,
        blockedDuplicates,
      });
    } else if (blockedDuplicates.length) {
      blockedClusters.push({
        normalizedName,
        canonicalPlaceId: canonicalPlace.id,
        blockedDuplicates,
      });
    }
  });

  const suppressedIds = new Set(candidates.flatMap((candidate) => candidate.mergeableDuplicates.map((duplicate) => duplicate.duplicatePlaceId)));
  const afterPlaces = candidatePlaces.map((place) => (suppressedIds.has(place.id)
    ? { ...place, metadata: buildSuppressedMetadata({ city, canonicalPlaceId: candidates.find((candidate) => candidate.mergeableDuplicates.some((duplicate) => duplicate.duplicatePlaceId === place.id))?.canonicalPlace.id, normalizedName: normalizeName(place.name), distanceMeters: 0, previousMetadata: place.metadata }) }
    : place));
  const afterDuplicateClusters = buildDuplicateClusters(afterPlaces, { maxDistanceMeters: auditDistanceMeters });

  return {
    city,
    maxDistanceMeters,
    auditDistanceMeters,
    beforeDuplicateBlockerCount: beforeDuplicateClusters.length,
    afterDuplicateBlockerCount: afterDuplicateClusters.length,
    candidates,
    blockedClusters,
  };
};

module.exports = {
  DUPLICATE_CANONICALIZATION_KEY,
  AUDIT_DUPLICATE_DISTANCE_METERS,
  CANONICALIZATION_DISTANCE_METERS,
  buildCanonicalizationPlan,
  buildCanonicalMetadata,
  buildDuplicateClusters,
  createZeroReferenceSummary,
  getReferenceSummary,
  isSuppressedDuplicatePlace,
  normalizeName,
};
