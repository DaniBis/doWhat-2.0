import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";

import AdminNewSessionPage from "../page";

const mockUseSearchParams = jest.fn();

jest.mock("next/navigation", () => ({
  ...jest.requireActual("next/navigation"),
  useSearchParams: () => mockUseSearchParams(),
}));

const mockGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase/browser", () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

jest.mock("@/components/TaxonomyCategoryPicker", () => ({
  __esModule: true,
  default: ({ selectedIds }: { selectedIds: string[] }) => (
    <div data-testid="taxonomy-picker">Selected IDs: {selectedIds.join(", ") || "none"}</div>
  ),
}));

jest.mock("@dowhat/shared", () => ({
  activityTaxonomy: [],
  defaultTier3Index: [
    { id: "tier3-run", label: "Trail Run", tier1Label: "Outdoors" },
    { id: "tier3-climb", label: "Bouldering", tier1Label: "Movement" },
    { id: "tier3-dance", label: "Dance Flow", tier2Label: "Creative" },
  ],
  trackSessionOpenSlotsPublished: jest.fn(),
}));

const { trackSessionOpenSlotsPublished } = jest.requireMock("@dowhat/shared") as {
  trackSessionOpenSlotsPublished: jest.Mock;
};

const buildSearchParams = (entries: Record<string, string | string[]>) => {
  const params = new URLSearchParams();
  Object.entries(entries).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, v));
    } else {
      params.append(key, value);
    }
  });
  return params;
};

const createQueryChain = () => {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.insert = jest.fn().mockReturnValue(chain);
  chain.update = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.delete = jest.fn().mockReturnValue(chain);
  chain.returns = jest.fn().mockReturnValue({ data: [], error: null });
  chain.single = jest.fn().mockReturnValue({ data: { id: "session-123" }, error: null });
  return chain;
};

describe("AdminNewSessionPage prefills", () => {
  const originalEnv = process.env.NEXT_PUBLIC_ADMIN_EMAILS;
  const originalLookingForPlayersFlag = process.env.NEXT_PUBLIC_FEATURE_LOOKING_FOR_PLAYERS;
  const renderPage = async () => {
    await act(async () => {
      render(<AdminNewSessionPage />);
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = "ops@example.com";
    delete process.env.NEXT_PUBLIC_FEATURE_LOOKING_FOR_PLAYERS;
    mockGetUser.mockReturnValue({ data: { user: { email: "ops@example.com" } } });
    mockFrom.mockImplementation(() => createQueryChain());
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = originalEnv;
    if (originalLookingForPlayersFlag === undefined) {
      delete process.env.NEXT_PUBLIC_FEATURE_LOOKING_FOR_PLAYERS;
    } else {
      process.env.NEXT_PUBLIC_FEATURE_LOOKING_FOR_PLAYERS = originalLookingForPlayersFlag;
    }
  });

  it("shows multi-category prefills with contextual summary", async () => {
    mockUseSearchParams.mockReturnValue(
      buildSearchParams({
        activityId: "act-77",
        activityName: "Sunrise Flow",
        venueId: "ven-88",
        venueName: "Central Park",
        venueAddress: "123 Park Ave",
        lat: "10.1234567",
        lng: "-20.7654321",
        price: "25",
        startsAt: "2025-12-08T09:00:00.000Z",
        endsAt: "2025-12-08T11:00:00.000Z",
        categoryIds: "tier3-run,tier3-climb",
        categoryId: ["tier3-climb", "tier3-dance"],
        source: "venue_verification_detail",
      }),
    );

    await renderPage();

    expect(
      await screen.findByText(/Prefilled via Venue verification detail/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Taxonomy preset:/)).toHaveTextContent(
      "Trail Run • Outdoors, Bouldering • Movement",
    );
    expect(screen.getByText("Sunrise Flow • ID act-77")).toBeInTheDocument();
    expect(screen.getByText("Central Park • 123 Park Ave • ID ven-88")).toBeInTheDocument();
    expect(screen.getByText("10.123457, -20.765432")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Trail Run • Outdoors / Bouldering • Movement / Dance Flow • Creative",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("shows a venue summary when only the address is provided", async () => {
    mockUseSearchParams.mockReturnValue(
      buildSearchParams({
        venueAddress: "500 Sunset Blvd",
      }),
    );

    await renderPage();

    const heading = await screen.findByText(/Prefill summary/i);
    const summaryCard = heading.closest("div")?.parentElement as HTMLElement;
    expect(summaryCard).toBeTruthy();
    expect(within(summaryCard).getByText("Venue")).toBeInTheDocument();
    expect(screen.getByText("500 Sunset Blvd")).toBeInTheDocument();
  });

  it("shows coordinate placeholders when only one value is provided", async () => {
    mockUseSearchParams.mockReturnValue(
      buildSearchParams({
        lat: "10.5",
      }),
    );

    await renderPage();

    expect(await screen.findByText(/Prefill summary/i)).toBeInTheDocument();
    expect(screen.getByText("Coordinates")).toBeInTheDocument();
    expect(screen.getByText("10.500000, —")).toBeInTheDocument();
  });

  it("warns when venue prefills omit address or coordinates", async () => {
    mockUseSearchParams.mockReturnValue(
      buildSearchParams({
        venueId: "ven-99",
        venueName: "Unnamed Warehouse",
        lat: "12.34",
      }),
    );

    await renderPage();

    expect(
      await screen.findByText(/Check venue details before publishing/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/did not include a venue address/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/only supplied one coordinate value/i),
    ).toBeInTheDocument();
  });

  it("warns when only coordinates are provided", async () => {
    mockUseSearchParams.mockReturnValue(
      buildSearchParams({
        lat: "10.5",
        lng: "-20.25",
      }),
    );

    await renderPage();

    expect(await screen.findByText(/Check venue details before publishing/i)).toBeInTheDocument();
    expect(screen.getByText(/did not include a venue address/i)).toBeInTheDocument();
    expect(screen.queryByText(/only supplied one coordinate value/i)).not.toBeInTheDocument();
  });

  it("hides Looking for players controls when the feature flag is off", async () => {
    process.env.NEXT_PUBLIC_FEATURE_LOOKING_FOR_PLAYERS = "false";
    mockUseSearchParams.mockReturnValue(new URLSearchParams());

    await renderPage();

    expect(screen.queryByText(/Looking for players/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Toggle Looking for players/i)).not.toBeInTheDocument();
  });

  it("shows Looking for players controls by default", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());

    await renderPage();

    expect(await screen.findByText(/Looking for players/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/Toggle Looking for players/i)).toBeInTheDocument();
  });

  it("clears hydrated fields when clicking Clear prefills", async () => {
    const now = new Date("2025-12-05T08:00:00.000Z");
    jest.useFakeTimers().setSystemTime(now);

    const defaultStart = new Date(now);
    defaultStart.setDate(defaultStart.getDate() + 1);
    const expectedStart = defaultStart.toISOString().slice(0, 16);
    const expectedEnd = new Date(defaultStart.getTime() + 2 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16);

    mockUseSearchParams.mockReturnValue(
      buildSearchParams({
        activityName: "Cloned Activity",
        venueName: "Borrowed Venue",
        lat: "49.2",
        lng: "8.4",
        price: "35",
        startsAt: "2025-12-10T10:00",
        endsAt: "2025-12-10T12:30",
        categoryIds: "tier3-run",
      }),
    );

    try {
      await renderPage();

      const clearButton = await screen.findByRole("button", { name: /Clear all prefilled values/i });
      const activityInput = screen.getByPlaceholderText("e.g. Running") as HTMLInputElement;
      const venueInput = screen.getByPlaceholderText("e.g. City Park") as HTMLInputElement;
      const latInput = screen.getByPlaceholderText("51.5074") as HTMLInputElement;
      const lngInput = screen.getByPlaceholderText("-0.1278") as HTMLInputElement;
      const priceInput = screen.getByDisplayValue("35") as HTMLInputElement;
      const startInput = screen.getByDisplayValue("2025-12-10T08:00") as HTMLInputElement;
      const endInput = screen.getByDisplayValue("2025-12-10T10:30") as HTMLInputElement;

      expect(activityInput).toHaveValue("Cloned Activity");
      expect(venueInput).toHaveValue("Borrowed Venue");
      expect(latInput).toHaveValue("49.200000");
      expect(lngInput).toHaveValue("8.400000");

      fireEvent.click(clearButton);

      expect(activityInput).toHaveValue("");
      expect(venueInput).toHaveValue("");
      expect(latInput).toHaveValue("");
      expect(lngInput).toHaveValue("");
      expect(priceInput).toHaveValue("");
      expect(startInput).toHaveValue(expectedStart);
      expect(endInput).toHaveValue(expectedEnd);
      expect(screen.getByTestId("taxonomy-picker")).toHaveTextContent("none");
    } finally {
      jest.useRealTimers();
    }
  });

  it("locks unauthorized users out of the page", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    mockGetUser.mockReturnValue({ data: { user: { email: "viewer@example.com" } } });

    await renderPage();

    expect(
      await screen.findByText(/You don['’]t have access to this page/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Signed in as: viewer@example.com/i)).toBeInTheDocument();
    await waitFor(() => expect(mockFrom).toHaveBeenCalled());
  });

  it("reveals Looking for players inputs and resets them when toggled", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    process.env.NEXT_PUBLIC_FEATURE_LOOKING_FOR_PLAYERS = "true";

    await renderPage();

    const toggle = await screen.findByLabelText(/Toggle Looking for players/i);
    fireEvent.click(toggle);

    const playersInput = await screen.findByLabelText(/Players needed/i);
    fireEvent.change(playersInput, { target: { value: "0" } });
    expect(screen.getByText(/Enter between 1 and 12 players/i)).toBeInTheDocument();

    const skillInput = screen.getByLabelText(/Skill focus/i);
    fireEvent.change(skillInput, { target: { value: "Advanced runners" } });

    fireEvent.click(toggle); // turn off -> resets values
    fireEvent.click(toggle); // turn back on

    const resetPlayersInput = await screen.findByLabelText(/Players needed/i);
    expect(resetPlayersInput).toHaveValue(1);
    expect(screen.getByLabelText(/Skill focus/i)).toHaveValue("");
  });

  it("creates open slots and emits telemetry when Looking for players is enabled", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());

    const activitiesChain = createQueryChain();
    activitiesChain.single.mockReturnValue({ data: { id: "activity-new" }, error: null });
    const venuesChain = createQueryChain();
    venuesChain.single.mockReturnValue({ data: { id: "venue-new" }, error: null });
    const sessionsChain = createQueryChain();
    sessionsChain.single.mockReturnValue({ data: { id: "session-open-42" }, error: null });
    const openSlotsChain = createQueryChain();
    openSlotsChain.single.mockReturnValue({ data: { id: "open-slot-9" }, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "activities") return activitiesChain;
      if (table === "venues") return venuesChain;
      if (table === "sessions") return sessionsChain;
      if (table === "session_open_slots") return openSlotsChain;
      return createQueryChain();
    });

    const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, "location");
    let assignedHref = "";
    const locationMock = {
      get href() {
        return assignedHref;
      },
      set href(value: string) {
        assignedHref = value;
      },
    } as Location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: locationMock,
    });

    try {
      await renderPage();

      fireEvent.change(screen.getByPlaceholderText("e.g. Running"), {
        target: { value: "Weekend Run" },
      });
      fireEvent.change(screen.getByPlaceholderText("e.g. City Park"), {
        target: { value: "North Field" },
      });

      const toggle = await screen.findByLabelText(/Toggle Looking for players/i);
      fireEvent.click(toggle);

      const playersInput = await screen.findByLabelText(/Players needed/i);
      fireEvent.change(playersInput, { target: { value: "3" } });
      fireEvent.change(screen.getByLabelText(/Skill focus/i), {
        target: { value: "Intermediate crew" },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Create session/i }));
      });

      await waitFor(() => expect(openSlotsChain.insert).toHaveBeenCalled());
      expect(openSlotsChain.insert).toHaveBeenLastCalledWith({
        session_id: "session-open-42",
        slots_count: 3,
        required_skill_level: "Intermediate crew",
      });
      expect(trackSessionOpenSlotsPublished).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-open-42",
          slotsCount: 3,
          platform: "web",
          surface: "admin/new",
          requiredSkillLevel: "Intermediate crew",
          prefillSource: null,
          categoryCount: 0,
          activityPrefilled: false,
          venuePrefilled: false,
          manualActivityEntry: true,
          manualVenueEntry: true,
          fakeSessionRisk: "high",
          coordinatesProvided: false,
        }),
      );
      expect(assignedHref).toBe("/sessions/session-open-42");
    } finally {
      if (originalLocationDescriptor) {
        Object.defineProperty(window, "location", originalLocationDescriptor);
      }
    }
  });

  it("skips open-slot inserts when CTA stays off", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());

    const activitiesChain = createQueryChain();
    activitiesChain.single.mockReturnValue({ data: { id: "activity-off" }, error: null });
    const venuesChain = createQueryChain();
    venuesChain.single.mockReturnValue({ data: { id: "venue-off" }, error: null });
    const sessionsChain = createQueryChain();
    sessionsChain.single.mockReturnValue({ data: { id: "session-no-open" }, error: null });
    const openSlotsChain = createQueryChain();

    mockFrom.mockImplementation((table: string) => {
      if (table === "activities") return activitiesChain;
      if (table === "venues") return venuesChain;
      if (table === "sessions") return sessionsChain;
      if (table === "session_open_slots") return openSlotsChain;
      return createQueryChain();
    });

    const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, "location");
    let assignedHref = "";
    const locationMock = {
      get href() {
        return assignedHref;
      },
      set href(value: string) {
        assignedHref = value;
      },
    } as Location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: locationMock,
    });

    try {
      await renderPage();

      fireEvent.change(screen.getByPlaceholderText("e.g. Running"), {
        target: { value: "No CTA Run" },
      });
      fireEvent.change(screen.getByPlaceholderText("e.g. City Park"), {
        target: { value: "No CTA Venue" },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Create session/i }));
      });

      await waitFor(() => expect(sessionsChain.insert).toHaveBeenCalled());
      expect(openSlotsChain.insert).not.toHaveBeenCalled();
      expect(trackSessionOpenSlotsPublished).not.toHaveBeenCalled();
      expect(assignedHref).toBe("/sessions/session-no-open");
    } finally {
      if (originalLocationDescriptor) {
        Object.defineProperty(window, "location", originalLocationDescriptor);
      }
    }
  });

  it("rolls back the session and surfaces errors when open-slot inserts fail", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());

    const activitiesChain = createQueryChain();
    activitiesChain.single.mockReturnValue({ data: { id: "activity-risk" }, error: null });
    const venuesChain = createQueryChain();
    venuesChain.single.mockReturnValue({ data: { id: "venue-risk" }, error: null });
    const sessionsChain = createQueryChain();
    sessionsChain.single.mockReturnValue({ data: { id: "session-risk" }, error: null });
    const openSlotsChain = createQueryChain();
    openSlotsChain.single.mockReturnValue({ data: null, error: new Error("RLS blocked: session_open_slots") });

    mockFrom.mockImplementation((table: string) => {
      if (table === "activities") return activitiesChain;
      if (table === "venues") return venuesChain;
      if (table === "sessions") return sessionsChain;
      if (table === "session_open_slots") return openSlotsChain;
      return createQueryChain();
    });

    await renderPage();

    fireEvent.change(screen.getByPlaceholderText("e.g. Running"), {
      target: { value: "Risk Run" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. City Park"), {
      target: { value: "Risk Venue" },
    });

    const toggle = await screen.findByLabelText(/Toggle Looking for players/i);
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText(/Players needed/i), { target: { value: "5" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Create session/i }));
    });

    await waitFor(() => expect(openSlotsChain.insert).toHaveBeenCalled());
    await waitFor(() => expect(sessionsChain.delete).toHaveBeenCalled());
    expect(sessionsChain.eq).toHaveBeenCalledWith("id", "session-risk");
    expect(trackSessionOpenSlotsPublished).not.toHaveBeenCalled();
    expect(await screen.findByText(/RLS blocked/i)).toBeInTheDocument();
  });
});
