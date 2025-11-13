export * from './types.badges';

// Consolidated badge merge / placeholder types (moved from web app)
import type { BadgeStatus, Badge, BadgeCategory } from './types.badges';
export interface CatalogBadge { id: string; code: string; name: string; category: BadgeCategory | string; description?: string | null }
export interface OwnedBadge { id: string; badge_id: string; status: BadgeStatus; source?: string | null; endorsements?: number; badges?: Partial<Badge> | null; locked?: false }
export interface LockedBadgePlaceholder { badge_id: string; status: 'unverified'; badges: CatalogBadge; locked: true }
export type MergedBadge = OwnedBadge | LockedBadgePlaceholder;

export function mergeCatalogWithOwned(catalog: CatalogBadge[], owned: OwnedBadge[]): MergedBadge[] {
	const ownedMap = new Map(owned.map(o => [o.badge_id || o.badges?.id, o] as const));
	return catalog.map(cb => {
		const ob = ownedMap.get(cb.id);
		if (ob) return ob;
		return { badge_id: cb.id, status: 'unverified', badges: cb, locked: true } as LockedBadgePlaceholder;
	});
}

// ---------------- Reliability Index Shared Types (lightweight, colocated to avoid churn) ----------------
export interface ReliabilityMetricsWindow {
	attended?: number; // A
	no_shows?: number; // NS
	late_cancels?: number; // Cx
	excused?: number; // Ex
	on_time?: number; // OT
	late?: number; // L
	reviews?: number; // N
	weighted_review?: number; // R (raw weighted average 1..5)
	last_event_at?: string; // ISO timestamp
}

export interface ReliabilityComponentsBreakdown {
	AS_30?: number;
	AS_90?: number;
	RS?: number | null;
	host_bonus?: number;
	attendance_rate_30?: number;
	attendance_rate_90?: number;
	no_show_rate_30?: number;
	no_show_rate_90?: number;
	late_cancel_rate_30?: number;
	late_cancel_rate_90?: number;
	punctuality_30?: number;
	punctuality_90?: number;
}

export interface ReliabilityIndexRecord {
	user_id: string;
	score: number; // 0..100
	confidence: number; // 0..1
	components_json: ReliabilityComponentsBreakdown;
	last_recomputed: string;
}

export const RELIABILITY_DEFAULT_WEIGHTS = Object.freeze({
	NO_SHOW_WEIGHT: 0.70,
	LATE_CANCEL_WEIGHT: 0.30,
	RECENCY_BLEND_30: 0.6,
	RECENCY_BLEND_90: 0.4
});
