export type TraitOption = {
  id: string;
  name: string;
  color: string;
  icon: string;
};

export type TraitSummary = TraitOption & {
  score: number;
  baseCount: number;
  voteCount: number;
  updatedAt: string;
};

export type TraitOnboardingPayload = {
  traitIds: string[];
};

export type TraitVoteRequest = {
  votes: Array<{
    toUserId: string;
    traits: string[];
  }>;
};

export type TraitVoteResult = {
  sessionId: string;
  votesInserted: number;
};
