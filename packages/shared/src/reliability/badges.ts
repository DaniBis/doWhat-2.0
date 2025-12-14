export type ReliabilityBadgeKey = "going" | "interested" | "verified";

export type ReliabilityBadgeToken = {
  key: ReliabilityBadgeKey;
  label: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  icon?: string;
};

const emeraldSurface = "#ECFDF5";
const emeraldBorder = "#A7F3D0";
const emeraldText = "#065F46";
const amberSurface = "#FFFBEB";
const amberBorder = "#FDE68A";
const amberText = "#92400E";
const indigoSurface = "#EEF2FF";
const indigoBorder = "#C7D2FE";
const indigoText = "#3730A3";

export const RELIABILITY_BADGE_TOKENS: Record<ReliabilityBadgeKey, ReliabilityBadgeToken> = {
  going: {
    key: "going",
    label: "Going",
    backgroundColor: emeraldSurface,
    borderColor: emeraldBorder,
    textColor: emeraldText,
    icon: "👥",
  },
  interested: {
    key: "interested",
    label: "Interested",
    backgroundColor: amberSurface,
    borderColor: amberBorder,
    textColor: amberText,
    icon: "⭐",
  },
  verified: {
    key: "verified",
    label: "GPS verified",
    backgroundColor: indigoSurface,
    borderColor: indigoBorder,
    textColor: indigoText,
    icon: "📍",
  },
};

export const RELIABILITY_BADGE_ORDER: ReliabilityBadgeKey[] = ["going", "interested", "verified"];
