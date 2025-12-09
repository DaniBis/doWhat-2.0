import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import AdminDashboard from "../page";
import { buildSessionCloneQuery } from "@/lib/adminPrefill";

jest.mock("@/components/TaxonomyCategoryPicker", () => ({
  __esModule: true,
  default: ({ selectedIds }: { selectedIds: string[] }) => (
    <div data-testid="taxonomy-picker">Selected: {selectedIds.join(", ") || "none"}</div>
  ),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

jest.mock("@dowhat/shared", () => ({
  ACTIVITY_TIME_FILTER_OPTIONS: [
    { key: "any", label: "Any", helper: "" },
    { key: "morning", label: "Morning", helper: "" },
  ],
  activityTaxonomy: [],
  defaultTier3Index: [
    { id: "tier3-yoga", label: "Yoga Flow", tier1Label: "Movement" },
    { id: "tier3-dance", label: "Dance", tier1Label: "Creative" },
  ],
}));

jest.mock("@/lib/adminPrefill", () => ({
  buildSessionCloneQuery: jest.fn(() => ({})),
}));

const mockedBuildSessionCloneQuery = buildSessionCloneQuery as jest.MockedFunction<typeof buildSessionCloneQuery>;

const mockGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase/browser", () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

type SessionRow = {
  id: string;
  activity_id: string | null;
  venue_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  price_cents: number | null;
  activities?: { name?: string | null; activity_types?: string[] | null } | null;
  venues?: { name?: string | null; address?: string | null; lat?: number | null; lng?: number | null } | null;
};

const createSelectOrderChain = (rows: unknown[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockResolvedValue({ data: rows, error: null });
  return chain;
};

const createProfilesTotalChain = (count: number) => ({
  select: jest.fn().mockResolvedValue({ data: null, error: null, count }),
});

const createProfilesRecentChain = (count: number) => {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.gte = jest.fn().mockResolvedValue({ data: null, error: null, count });
  return chain;
};

const createProfilesPreviousChain = (count: number) => {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.gte = jest.fn().mockReturnValue(chain);
  chain.lt = jest.fn().mockResolvedValue({ data: null, error: null, count });
  return chain;
};

const setupSupabaseQueries = (sessions: SessionRow[] = []) => {
  let profileCall = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table === "venues") {
      return createSelectOrderChain([]);
    }
    if (table === "sessions") {
      return createSelectOrderChain(sessions);
    }
    if (table === "profiles") {
      profileCall += 1;
      if (profileCall === 1) return createProfilesTotalChain(40);
      if (profileCall === 2) return createProfilesRecentChain(12);
      return createProfilesPreviousChain(9);
    }
    return createSelectOrderChain([]);
  });
};

describe("AdminDashboard", () => {
  const originalAllowlist = process.env.NEXT_PUBLIC_ADMIN_EMAILS;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = "ops@example.com";
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = originalAllowlist;
  });

  it("hydrates Plan another links with venue metadata", async () => {
    const sessionRows: SessionRow[] = [
      {
        id: "session-12",
        activity_id: "act-55",
        venue_id: "venue-33",
        starts_at: "2025-12-06T09:00:00.000Z",
        ends_at: "2025-12-06T11:00:00.000Z",
        price_cents: 2500,
        activities: { name: "Sunrise Flow", activity_types: ["tier3-yoga", "tier3-dance"] },
        venues: { name: "Central Park", address: "123 Park Ave", lat: 10.2, lng: -20.4 },
      },
    ];
    mockGetUser.mockResolvedValue({ data: { user: { email: "ops@example.com" } } });
    setupSupabaseQueries(sessionRows);

    render(<AdminDashboard />);

    expect(await screen.findByText(/All Sessions/i)).toBeInTheDocument();
    await waitFor(() => expect(mockedBuildSessionCloneQuery).toHaveBeenCalled());
    const payload = mockedBuildSessionCloneQuery.mock.calls[0][0];
    expect(payload).toMatchObject({
      activityId: "act-55",
      activityName: "Sunrise Flow",
      activityTypes: ["tier3-yoga", "tier3-dance"],
      venueId: "venue-33",
      venueName: "Central Park",
      venueAddress: "123 Park Ave",
      venueLat: 10.2,
      venueLng: -20.4,
      priceCents: 2500,
      startsAt: "2025-12-06T09:00:00.000Z",
      endsAt: "2025-12-06T11:00:00.000Z",
    });
    const planLink = screen.getByRole("link", { name: /Plan another session using Sunrise Flow/i });
    expect(planLink).toBeInTheDocument();
  });

  it("locks non-admin users out", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: "viewer@example.com" } } });
    setupSupabaseQueries();

    render(<AdminDashboard />);

    expect(await screen.findByText(/You don['’]t have access to this page/i)).toBeInTheDocument();
    expect(screen.getByText(/Signed in as: viewer@example.com/i)).toBeInTheDocument();
  });
});
