import { hydrateSessions } from "../server";
import type { SessionRow } from "@/types/database";

const NOW_ISO = "2025-01-01T10:00:00.000Z";

describe("hydrateSessions", () => {
  it("enriches canonical place metadata and reliability", async () => {
    const sessionRows: SessionRow[] = [
      {
        id: "session-1",
        activity_id: "activity-1",
        venue_id: "venue-1",
        place_id: "place-1",
        host_user_id: "user-1",
        starts_at: NOW_ISO,
        ends_at: "2025-01-01T12:00:00.000Z",
        price_cents: 1500,
        visibility: "public",
        max_attendees: 16,
        place_label: "  Downtown Court  ",
        reliability_score: 76,
        description: "Pickup run",
        created_at: NOW_ISO,
        updated_at: NOW_ISO,
      },
    ];

    const service = buildService({
      activities: [
        {
          id: "activity-1",
          name: "Hoops",
          description: "3v3",
          venue: "Old label",
          lat: 44.42,
          lng: 26.09,
        },
      ],
      venues: [
        {
          id: "venue-1",
          name: "Sports hub",
          address: "123 Court St",
          lat: 44.43,
          lng: 26.1,
        },
      ],
      profiles: [
        {
          id: "user-1",
          username: "alex",
          full_name: "Alex",
          avatar_url: null,
        },
      ],
      places: [
        {
          id: "place-1",
          name: "Downtown Court",
          address: "456 Arena Blvd",
          lat: 44.44,
          lng: 26.11,
          locality: "Bucharest",
          region: "RO-B",
          country: "RO",
          categories: ["basketball"],
          kind: "venue",
        },
      ],
    });

    const [hydrated] = await hydrateSessions(service as never, sessionRows);

    expect(hydrated).toEqual(
      expect.objectContaining({
        id: "session-1",
        placeId: "place-1",
        placeLabel: "Downtown Court",
        reliabilityScore: 76,
        place: {
          id: "place-1",
          name: "Downtown Court",
          address: "456 Arena Blvd",
          lat: 44.44,
          lng: 26.11,
          locality: "Bucharest",
          region: "RO-B",
          country: "RO",
          categories: ["basketball"],
          kind: "venue",
        },
      }),
    );
    expect(hydrated.activity).toEqual(
      expect.objectContaining({ id: "activity-1", name: "Hoops" }),
    );
    expect(hydrated.venue).toEqual(
      expect.objectContaining({ id: "venue-1", name: "Sports hub" }),
    );
    expect(hydrated.host).toEqual(
      expect.objectContaining({ id: "user-1", username: "alex" }),
    );
  });
});

type TableMap = {
  activities?: Array<Record<string, unknown>>;
  venues?: Array<Record<string, unknown>>;
  profiles?: Array<Record<string, unknown>>;
  places?: Array<Record<string, unknown>>;
};

function buildService(tables: TableMap) {
  return {
    from: jest.fn((table: string) => {
      if (table === "activities") return makeQuery(tables.activities ?? []);
      if (table === "venues") return makeQuery(tables.venues ?? []);
      if (table === "profiles") return makeQuery(tables.profiles ?? []);
      if (table === "places") return makeQuery(tables.places ?? []);
      return makeQuery([]);
    }),
  };
}

function makeQuery<T>(rows: T[]) {
  const query: {
    select: jest.Mock;
    in: jest.Mock<Promise<{ data: T[]; error: null }>, [string?, string[]?]>;
  } = {
    select: jest.fn(),
    in: jest.fn(),
  };
  query.select.mockReturnValue(query);
  query.in.mockResolvedValue({ data: rows, error: null });
  return query;
}
