import { buildVenueSavePayload } from "../savePayload";
import type { RankedVenueActivity } from "@/lib/venues/types";

jest.mock("@dowhat/shared", () => {
  const actual = jest.requireActual("@dowhat/shared");
  return {
    ...actual,
    buildPlaceSavePayload: jest.fn((summary) => ({
      id: summary.id,
      name: summary.name,
      metadata: { base: 'shared' },
      address: summary.address ?? undefined,
    })),
  };
});

describe("buildVenueSavePayload", () => {
  const baseVenue: RankedVenueActivity = {
    venueId: "venue-1",
    venueName: "Test Venue",
    lat: 10,
    lng: 20,
    displayAddress: "123 Main St",
    primaryCategories: ["Studio"],
    rating: 4.7,
    priceLevel: 2,
    activity: "yoga",
    aiConfidence: 0.92,
    userYesVotes: 0,
    userNoVotes: 0,
    categoryMatch: true,
    keywordMatch: false,
    score: 87,
    verified: true,
    needsVerification: false,
    photoUrl: null,
    openNow: true,
    hoursSummary: null,
  };

  it("returns null when venue id missing", () => {
    expect(buildVenueSavePayload(undefined)).toBeNull();
    expect(buildVenueSavePayload({ ...baseVenue, venueId: null as unknown as string })).toBeNull();
  });

  it("decorates the shared payload with venue verification metadata", () => {
    const payload = buildVenueSavePayload(baseVenue);
    expect(payload).toEqual({
      id: "venue-1",
      name: "Test Venue",
      address: "123 Main St",
      metadata: {
        base: "shared",
        source: "venue_verification",
        activity: "yoga",
        aiConfidence: 0.92,
        score: 87,
        verified: true,
        needsVerification: false,
      },
    });
  });
});
