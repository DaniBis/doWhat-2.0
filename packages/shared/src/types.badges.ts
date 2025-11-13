export type BadgeCategory =
  | 'reliability_trust'
  | 'emotional_warmth'
  | 'energy_personality'
  | 'drive_ambition'
  | 'thinking_cognitive'
  | 'communication'
  | 'social_compatibility'
  | 'balance_self_management'
  | 'growth_development'
  | 'distinctive_traits';

export type BadgeStatus = 'unverified' | 'verified' | 'expired';

export type Badge = {
  id: string;
  code: string;
  name: string;
  category: BadgeCategory;
  description?: string | null;
  tier?: number | null;
  seasonal?: boolean | null;
};

export type UserBadge = {
  id: string;
  user_id: string;
  badge_id: string;
  status: BadgeStatus;
  source: 'endorsement' | 'activity' | 'behavior' | 'admin' | 'seasonal';
  created_at?: string;
  verified_at?: string | null;
  expiry_date?: string | null;
  badges?: Partial<Badge> | null;
};

export const BADGE_VERIFICATION_THRESHOLD_DEFAULT = 3; // endorsements

export const BADGE_CATEGORIES: Record<BadgeCategory, string> = {
  reliability_trust: 'Reliability & Trust',
  emotional_warmth: 'Emotional Warmth & Empathy',
  energy_personality: 'Energy & Personality',
  drive_ambition: 'Drive & Ambition',
  thinking_cognitive: 'Thinking & Cognitive',
  communication: 'Communication & Interaction',
  social_compatibility: 'Social Compatibility',
  balance_self_management: 'Balance & Self-Management',
  growth_development: 'Growth & Development',
  distinctive_traits: 'Distinctive Positive Traits',
};
