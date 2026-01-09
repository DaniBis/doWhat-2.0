import { resolvePlaceFromCoordsWithClient } from "@/lib/places/resolver";
import { __sessionServerTesting, ensureActivity, hydrateSessions, resolveSessionPlaceId } from "../server";
import type { SessionRow } from "@/types/database";

jest.mock('@/lib/places/resolver', () => ({
  resolvePlaceFromCoordsWithClient: jest.fn(),
}));

const resolvePlaceMock = resolvePlaceFromCoordsWithClient as jest.Mock;

const NOW_ISO = "2025-01-01T10:00:00.000Z";

beforeEach(() => {
  resolvePlaceMock.mockReset();
});

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

describe("ensureActivity", () => {
  beforeEach(() => {
    __sessionServerTesting.resetActivitiesPlaceColumnDetection();
  });

  it("retries without place_id when the column is missing", async () => {
    const activities = createActivitiesBuilder();
    const service = { from: jest.fn(() => activities) } as unknown as SupabaseMock;

    const id = await ensureActivity(service as never, {
      activityName: "Chess",
      placeId: "place-123",
      lat: 44.43384,
      lng: 26.04346,
    });

    expect(id).toBe("activity-new");
    expect(activities.maybeSingle).toHaveBeenCalledTimes(2);
    expect(activities.insert).toHaveBeenCalledTimes(1);
    expect(activities.insert.mock.calls[0][0]).toEqual({
      name: "Chess",
      lat: 44.43384,
      lng: 26.04346,
    });
  });
});

describe("resolveSessionPlaceId", () => {
  beforeEach(() => {
    __sessionServerTesting.resetActivitiesPlaceColumnDetection();
  });

  it("resolves a place when the activity has no place_id", async () => {
    resolvePlaceMock.mockResolvedValue({
      placeId: "place-9",
      label: "Central Court",
      source: "cache",
      place: {
        id: "place-9",
        name: "Central Court",
        lat: 44.44,
        lng: 26.11,
        address: null,
        locality: null,
        region: null,
        country: null,
        categories: null,
      },
    });

    const activities = createActivityPlaceBuilder(null);
    const service = { from: jest.fn(() => activities) } as unknown as SupabaseMock;

    const placeId = await resolveSessionPlaceId(service as never, {
      activityId: "c1f7a0af-1f3a-4e16-9e3d-7e6dc3cc5b7a",
      lat: 44.43384,
      lng: 26.04346,
      labelHint: "Central Court",
    });

    expect(placeId).toBe("place-9");
    expect(resolvePlaceMock).toHaveBeenCalledTimes(1);
    expect(activities.update).toHaveBeenCalledWith({ place_id: "place-9" });
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

type SupabaseMock = { from: jest.Mock };
type ActivitiesBuilder = {
  lastSelect: string;
  select: jest.Mock<ActivitiesBuilder, [string]>;
  eq: jest.Mock<ActivitiesBuilder, []>;
  maybeSingle: jest.Mock<Promise<{ data: null; error: { message: string } | null }>, []>;
  insert: jest.Mock<
    {
      select: () => {
        single: () => Promise<{ data: { id: string }; error: null }>;
      };
    },
    [Record<string, unknown>]
  >;
};

function createActivitiesBuilder() {
  let failForPlaceColumn = true;
  const insert: ActivitiesBuilder['insert'] = jest.fn((payload: Record<string, unknown>) => ({
    select: () => ({
      single: async () => ({ data: { id: "activity-new" }, error: null }),
    }),
  }));

  const builder: ActivitiesBuilder = {
    lastSelect: "",
    select: jest.fn(function select(columns: string) {
      builder.lastSelect = columns;
      return builder;
    }),
    eq: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => {
      if (failForPlaceColumn && builder.lastSelect.includes("place_id")) {
        failForPlaceColumn = false;
        return { data: null, error: { message: "column activities.place_id does not exist" } };
      }
      return { data: null, error: null };
    }),
    insert,
  };

  return builder;
}

type ActivityPlaceBuilder = {
  select: jest.Mock<ActivityPlaceBuilder, [string]>;
  eq: jest.Mock<ActivityPlaceBuilder, [string, string?]>;
  maybeSingle: jest.Mock<Promise<{ data: { id: string; place_id: string | null } | null; error: null }>, []>;
  update: jest.Mock<ActivityPlaceBuilder, [Record<string, unknown>]>;
};

function createActivityPlaceBuilder(placeId: string | null) {
  const builder: ActivityPlaceBuilder = {
    select: jest.fn((_columns: string) => builder),
    eq: jest.fn((_column: string, _value?: string) => builder),
    maybeSingle: jest.fn(async () => ({
      data: { id: "activity-1", place_id: placeId },
      error: null,
    })),
    update: jest.fn((_payload: Record<string, unknown>) => builder),
  };
  return builder;
}
