type ReliabilityAction = "attended" | "cancel_late" | "cancel_early" | "no_show";

const MAX_SCORE = 100;
const MIN_SCORE = 0;
const ACTION_DELTAS: Record<ReliabilityAction, number> = {
  attended: 10,
  cancel_late: -10,
  cancel_early: 0,
  no_show: -30,
};

const clamp = (value: number) => Math.min(MAX_SCORE, Math.max(MIN_SCORE, value));

/**
 * Applies the doWhat reliability rules to a participant score.
 */
export const calculateNewScore = (currentScore: number, action: ReliabilityAction): number => {
  const safeScore = Number.isFinite(currentScore) ? currentScore : MAX_SCORE;
  const delta = ACTION_DELTAS[action];
  return clamp(safeScore + delta);
};

export type { ReliabilityAction };
