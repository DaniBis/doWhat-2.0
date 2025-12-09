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
}));

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
  chain.returns = jest.fn().mockReturnValue({ data: [], error: null });
  chain.single = jest.fn().mockReturnValue({ data: { id: "session-123" }, error: null });
  return chain;
};

describe("AdminNewSessionPage prefills", () => {
  const originalEnv = process.env.NEXT_PUBLIC_ADMIN_EMAILS;
  const renderPage = async () => {
    await act(async () => {
      render(<AdminNewSessionPage />);
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = "ops@example.com";
    mockGetUser.mockReturnValue({ data: { user: { email: "ops@example.com" } } });
    mockFrom.mockImplementation(() => createQueryChain());
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = originalEnv;
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
});
