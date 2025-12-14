import { SportType } from "../sports/taxonomy";

export type RankableProfile = {
  id: string;
  latitude?: number | null;
  longitude?: number | null;
  primarySport?: SportType | null;
  defaultSkillLevel?: string | null;
  sportProfiles?: Array<{
    sport: SportType | null;
    skillLevel?: string | null;
  }>;
};

export type SessionOpenSlots = {
  slotsTotal: number;
  slotsTaken: number;
};

export type SessionWithSlots = {
  id: string;
  sport: SportType | null;
  requiredSkillLevel?: string | null;
  startsAt: string | Date;
  latitude?: number | null;
  longitude?: number | null;
  openSlots?: SessionOpenSlots | null;
};

export type RankingBreakdown = {
  distance: number;
  skill: number;
  urgency: number;
};

export type RankedSession = {
  session: SessionWithSlots;
  score: number;
  breakdown: RankingBreakdown;
};

const EARTH_RADIUS_KM = 6371;
const DEGREE_TO_RAD = Math.PI / 180;
const DISTANCE_SCORE_MAX = 40;
const SKILL_SCORE_MAX = 35;
const URGENCY_SCORE_MAX = 30;

export const MAX_RANKING_SCORE = DISTANCE_SCORE_MAX + SKILL_SCORE_MAX + URGENCY_SCORE_MAX;

function toRadians(value: number): number {
  return value * DEGREE_TO_RAD;
}

function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const fromLat = toRadians(lat1);
  const toLat = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(fromLat) * Math.cos(toLat);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function distanceScore(
  profile: RankableProfile,
  session: SessionWithSlots,
): number {
  if (
    profile.latitude == null ||
    profile.longitude == null ||
    session.latitude == null ||
    session.longitude == null
  ) {
    return 0;
  }

  const distanceKm = haversineDistanceKm(
    profile.latitude,
    profile.longitude,
    session.latitude,
    session.longitude,
  );

  if (distanceKm <= 1) return DISTANCE_SCORE_MAX;
  if (distanceKm <= 3) return 30;
  if (distanceKm <= 5) return 20;
  if (distanceKm <= 10) return 10;
  return 0;
}

function resolveUserSkill(profile: RankableProfile, sport: SportType | null): string | null {
  if (!sport) return profile.defaultSkillLevel ?? null;
  const match = profile.sportProfiles?.find((p) => p.sport === sport);
  return match?.skillLevel ?? profile.defaultSkillLevel ?? null;
}

function normalizeSkill(skill?: string | null): string | null {
  return skill?.trim().toLowerCase() ?? null;
}

function skillScore(
  profile: RankableProfile,
  session: SessionWithSlots,
): number {
  const userSkill = normalizeSkill(resolveUserSkill(profile, session.sport));
  const requiredSkill = normalizeSkill(session.requiredSkillLevel);

  if (!requiredSkill) return userSkill ? 15 : 10;
  if (!userSkill) return 5;
  if (userSkill === requiredSkill) return SKILL_SCORE_MAX;
  return 15;
}

function urgencyScore(session: SessionWithSlots): number {
  const startsAt = typeof session.startsAt === "string" ? new Date(session.startsAt) : session.startsAt;
  if (Number.isNaN(startsAt?.getTime?.())) return 0;

  const hoursUntil = (startsAt.getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursUntil <= 0) return 0;
  if (hoursUntil <= 6) return URGENCY_SCORE_MAX;
  if (hoursUntil <= 24) return 20;
  if (hoursUntil <= 48) return 10;
  return 0;
}

export function normalizeRankingScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) {
    return 0;
  }
  const percent = (score / MAX_RANKING_SCORE) * 100;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

export function rankSessionsForUser(
  profile: RankableProfile,
  sessions: SessionWithSlots[],
): RankedSession[] {
  if (!sessions.length) return [];

  const ranked = sessions.map((session) => {
    const breakdown: RankingBreakdown = {
      distance: distanceScore(profile, session),
      skill: skillScore(profile, session),
      urgency: urgencyScore(session),
    };

    return {
      session,
      breakdown,
      score: breakdown.distance + breakdown.skill + breakdown.urgency,
    };
  });

  return ranked.sort((a, b) => b.score - a.score);
}
