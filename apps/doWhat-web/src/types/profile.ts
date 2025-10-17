// Profile domain shared types (web app scope)
export type KPI = { label: string; value: number };

export type Trait = {
  id: string;
  name: string;
  score: number;        // 0..100
  confidence: number;   // 0..1
  category: string;
};

export type BadgeStatus = 'unverified' | 'verified' | 'expired';
export type Badge = {
  id: string;
  name: string;
  status: BadgeStatus;
  level?: number;       // 1..3 optional
  earnedAt?: string;    // ISO
  seasonalUntil?: string;
};

export type AttendanceMetrics = {
  attended30: number; noShow30: number; lateCancel30: number; excused30: number;
  attended90: number; noShow90: number; lateCancel90: number; excused90: number;
};

export type Reliability = {
  score: number;          // 0..100
  confidence: number;     // 0..1
  components: { AS30: number; AS90: number; reviewScore?: number; hostBonus?: number };
};

export type ProfileUser = {
  id: string;
  name: string;
  email: string;
  location?: string;
  avatarUrl?: string;
  bio?: string;
  socials?: { instagram?: string | null; whatsapp?: string | null };
};

// Activity timeline placeholder type (not specified but needed for activities endpoint)
export type Activity = {
  id: string;
  ts: string; // ISO timestamp
  kind: string;
  label: string;
  meta?: Record<string, any>;
};
