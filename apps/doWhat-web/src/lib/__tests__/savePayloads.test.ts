import { buildPlaceSavePayload as buildSharedPlaceSavePayload, type PlaceSummary, type SavePayload } from "@dowhat/shared";

import { buildPlaceSavePayload } from "../savePayloads";

jest.mock("@dowhat/shared", () => ({
  buildPlaceSavePayload: jest.fn(),
}));

const mockedSharedBuilder = buildSharedPlaceSavePayload as jest.MockedFunction<typeof buildSharedPlaceSavePayload>;

describe("buildPlaceSavePayload (web)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSharedBuilder.mockReset();
  });

  it("returns null when the place is missing", () => {
    expect(buildPlaceSavePayload(undefined)).toBeNull();
    expect(buildPlaceSavePayload(null)).toBeNull();
    expect(mockedSharedBuilder).not.toHaveBeenCalled();
  });

  it("decorates the shared payload with map-specific metadata", () => {
    const sharedPayload: SavePayload = {
      id: "place-1",
      name: "Cafe",
      venueId: "venue-1",
      metadata: { baseKey: "base" },
    };
    mockedSharedBuilder.mockReturnValue(sharedPayload);

    const place: PlaceSummary = {
      id: "place-1",
      slug: "cafe-1",
      name: "Cafe",
      lat: 13.7563,
      lng: 100.5018,
      categories: ["coffee"],
      tags: ["wifi"],
      aggregatedFrom: ["foursquare"],
      attributions: [],
      city: "Bangkok",
      metadata: { aiConfidence: 0.9 },
    };

    const payload = buildPlaceSavePayload(place);

    expect(mockedSharedBuilder).toHaveBeenCalledWith(place, "Bangkok");
    expect(payload).toEqual({
      ...sharedPayload,
      metadata: {
        baseKey: "base",
        source: "places_map",
        categories: ["coffee"],
        tags: ["wifi"],
        slug: "cafe-1",
        lat: 13.7563,
        lng: 100.5018,
      },
    });
  });
});
