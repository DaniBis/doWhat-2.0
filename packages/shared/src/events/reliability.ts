export interface EventReliabilityInputs {
  attendedCount: number;
  verified: boolean;
  repeatVerifiedCount: number;
}

export const calculateEventReliability = ({
  attendedCount,
  verified,
  repeatVerifiedCount,
}: EventReliabilityInputs): number => {
  let score = 0;
  if (attendedCount >= 1) score += 20;
  if (attendedCount >= 3) score += 30;
  if (verified) score += 30;
  if (repeatVerifiedCount >= 2) score += 20;
  return Math.max(0, Math.min(score, 100));
};
