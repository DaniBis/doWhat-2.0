import {
  RankableProfile,
  rankSessionsForUser,
  SessionWithSlots,
} from "../rankSessions";

describe("rankSessionsForUser", () => {
  const baseProfile: RankableProfile = {
    id: "user-1",
    latitude: 13.75,
    longitude: 100.5,
    primarySport: "running",
    defaultSkillLevel: "intermediate",
    sportProfiles: [
      { sport: "running", skillLevel: "advanced" },
      { sport: "padel", skillLevel: "beginner" },
    ],
  };

  const makeSession = (overrides: Partial<SessionWithSlots>): SessionWithSlots => ({
    id: `session-${Math.random()}`,
    sport: "running",
    startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    latitude: 13.75,
    longitude: 100.51,
    requiredSkillLevel: "advanced",
    ...overrides,
  });

  it("returns sessions sorted by total score", () => {
    const sessions: SessionWithSlots[] = [
      makeSession({ id: "near-match", latitude: 13.751 }),
      makeSession({ id: "far", latitude: 13.9 }),
    ];

    const [best, second] = rankSessionsForUser(baseProfile, sessions);

    expect(best.session.id).toBe("near-match");
    expect(second.session.id).toBe("far");
    expect(best.score).toBeGreaterThan(second.score);
  });

  it("rewards skill alignment when requiredSkillLevel is present", () => {
    const sessions = [
      makeSession({ id: "match", requiredSkillLevel: "advanced" }),
      makeSession({ id: "mismatch", requiredSkillLevel: "beginner" }),
    ];

    const [best] = rankSessionsForUser(baseProfile, sessions);
    expect(best.session.id).toBe("match");
    expect(best.breakdown.skill).toBeGreaterThan(30);
  });

  it("uses urgency when distance and skills tie", () => {
    const soon = makeSession({ id: "soon", startsAt: new Date(Date.now() + 60 * 60 * 1000) });
    const later = makeSession({ id: "later", startsAt: new Date(Date.now() + 72 * 60 * 60 * 1000) });

    const result = rankSessionsForUser(baseProfile, [later, soon]);
    expect(result[0].session.id).toBe("soon");
    expect(result[0].breakdown.urgency).toBeGreaterThan(result[1].breakdown.urgency);
  });

  it("gracefully handles missing location data", () => {
    const profile = { ...baseProfile, latitude: undefined };
    const [ranked] = rankSessionsForUser(profile, [makeSession({ id: "no-distance" })]);
    expect(ranked.breakdown.distance).toBe(0);
  });

  it("returns an empty array when there are no sessions", () => {
    expect(rankSessionsForUser(baseProfile, [])).toEqual([]);
  });
});
