export type LaunchCityId = 'hanoi' | 'da-nang' | 'bangkok';

export type LaunchCityRelevance = 'priority' | 'supported' | 'optional';

export type ActivityFamilyId =
  | 'climbing'
  | 'outdoor-recreation'
  | 'cycling'
  | 'movement-wellness'
  | 'strength-fitness'
  | 'martial-arts'
  | 'racket-sports'
  | 'team-sports'
  | 'water-sports'
  | 'dance'
  | 'social-games'
  | 'creative-maker'
  | 'wellness'
  | 'community';

export type VenueTypeId =
  | 'climbing-gym'
  | 'mountain-trail'
  | 'walking-route'
  | 'running-track'
  | 'trail-network'
  | 'cycling-route'
  | 'bike-park'
  | 'beach'
  | 'spin-studio'
  | 'yoga-studio'
  | 'pilates-studio'
  | 'barre-studio'
  | 'wellness-studio'
  | 'gym'
  | 'crossfit-box'
  | 'martial-arts-gym'
  | 'boxing-gym'
  | 'fencing-club'
  | 'racket-club'
  | 'court'
  | 'table-tennis-hall'
  | 'stadium'
  | 'pitch'
  | 'sports-centre'
  | 'pool'
  | 'rowing-club'
  | 'kayak-centre'
  | 'surf-school'
  | 'dive-centre'
  | 'dance-studio'
  | 'board-game-club'
  | 'chess-club'
  | 'billiards-hall'
  | 'bowling-alley'
  | 'darts-club'
  | 'maker-studio'
  | 'art-studio'
  | 'music-rehearsal-space'
  | 'photo-studio'
  | 'community-centre'
  | 'park'
  | 'cultural-centre'
  | 'civic-building'
  | 'government-building'
  | 'hospitality-venue'
  | 'unnamed-place'
  | 'sauna-studio';

export type ActivityEvidenceSourceId =
  | 'manual_override'
  | 'session_evidence'
  | 'venue_activity_mapping'
  | 'explicit_provider_tag'
  | 'exact_taxonomy_match'
  | 'provider_category_match'
  | 'name_alias'
  | 'compatible_venue_type'
  | 'generic_context'
  | 'hard_negative';

export type ActivityProviderSignals = {
  osmTags?: Array<{ key: string; values: string[] }>;
  googleTypes?: string[];
  foursquareCategoryIds?: string[];
  foursquareLabels?: string[];
  internalTaxonomy?: string[];
};

export type ActivityQueryIntentConfig = {
  aliases: string[];
  specificMinScore: number;
  browseMinScore: number;
  requireStrongEvidenceForSpecific: boolean;
};

export type LaunchVisibilityMode = 'venue_only' | 'area_ok' | 'program_only';

export type LaunchVisibleActivityPolicy = {
  visibilityMode: LaunchVisibilityMode;
  browseVisibilityThreshold: number;
  specificQueryThreshold: number;
  suppressGenericShapes: boolean;
  allowedAreaShapes: VenueTypeId[];
};

export type CanonicalActivityDefinition = {
  id: string;
  displayLabel: string;
  aliases: string[];
  family: ActivityFamilyId;
  allowedVenueTypes: VenueTypeId[];
  preferredProviderCategories: ActivityProviderSignals;
  hardNegatives: string[];
  confidenceWeights: Partial<Record<ActivityEvidenceSourceId, number>>;
  queryIntent: ActivityQueryIntentConfig;
  launchVisibility: LaunchVisibleActivityPolicy;
  launchCityRelevance: Partial<Record<LaunchCityId, LaunchCityRelevance>>;
  legacyCatalogId?: number;
  searchable?: boolean;
};

export type CanonicalActivityEvidence = {
  source: ActivityEvidenceSourceId;
  weight: number;
  detail: string;
};

export type CanonicalActivityEvidenceInput = {
  name?: string | null;
  description?: string | null;
  categories?: readonly (string | null | undefined)[] | null;
  tags?: readonly (string | null | undefined)[] | null;
  taxonomyCategories?: readonly (string | null | undefined)[] | null;
  verifiedActivities?: readonly (string | null | undefined)[] | null;
  aiActivities?: readonly (string | null | undefined)[] | null;
  manualActivityIds?: readonly (string | null | undefined)[] | null;
  sessionActivityIds?: readonly (string | null | undefined)[] | null;
  mappedActivityIds?: readonly (string | null | undefined)[] | null;
  googleTypes?: readonly (string | null | undefined)[] | null;
  foursquareCategoryIds?: readonly (string | number | null | undefined)[] | null;
  foursquareLabels?: readonly (string | null | undefined)[] | null;
  venueTypes?: readonly (string | null | undefined)[] | null;
  osmTags?: Record<string, string | null | undefined> | null;
};

export type CanonicalActivityMatchResult = {
  activityId: string;
  score: number;
  eligible: boolean;
  strongEvidence: boolean;
  hardNegative: boolean;
  inferredVenueTypes: VenueTypeId[];
  evidence: CanonicalActivityEvidence[];
};

export type LaunchVisibleActivityMatchResult = {
  activityId: string;
  visible: boolean;
  reason:
    | 'unknown_activity'
    | 'below_browse_threshold'
    | 'manual_or_validated_evidence'
    | 'facility_supported'
    | 'area_supported'
    | 'insufficient_launch_evidence';
  policy: LaunchVisibleActivityPolicy | null;
  match: CanonicalActivityMatchResult;
};
