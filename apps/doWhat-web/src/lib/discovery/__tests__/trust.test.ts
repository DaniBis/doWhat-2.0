import { computeTrustScore } from '../trust';

describe('discovery trust scoring', () => {
  it('classifies verified venues as verified with high trust', () => {
    const result = computeTrustScore({
      aiConfidence: 0.92,
      verified: true,
      userYesVotes: 6,
      userNoVotes: 0,
      ratingCount: 120,
      eventCount: 8,
      freshnessHours: 3,
    });

    expect(result.verificationState).toBe('verified');
    expect(result.trustScore).toBeGreaterThan(0.8);
  });

  it('classifies high-confidence unverified venues as needs_votes', () => {
    const result = computeTrustScore({
      aiConfidence: 0.82,
      userYesVotes: 0,
      userNoVotes: 0,
      freshnessHours: 12,
    });

    expect(result.verificationState).toBe('needs_votes');
    expect(result.trustScore).toBeGreaterThan(0.45);
  });

  it('classifies low-signal venues as suggested', () => {
    const result = computeTrustScore({
      aiConfidence: 0.28,
      userYesVotes: 0,
      userNoVotes: 0,
      ratingCount: 0,
      eventCount: 0,
      freshnessHours: 2000,
    });

    expect(result.verificationState).toBe('suggested');
    expect(result.trustScore).toBeLessThan(0.5);
  });
});

