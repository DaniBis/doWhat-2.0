import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";

import AdminDashboard from "../page";
import { buildSessionCloneQuery } from "@/lib/adminPrefill";
import type { SocialSweatAdoptionMetricsRow } from "@/types/database";

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
  ONBOARDING_TRAIT_GOAL: 5,
}));

jest.mock("@/lib/adminPrefill", () => ({
  buildSessionCloneQuery: jest.fn(() => ({})),
}));

const mockedBuildSessionCloneQuery = buildSessionCloneQuery as jest.MockedFunction<typeof buildSessionCloneQuery>;

const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockFetch = jest.fn();

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

const createAdoptionChain = (row?: SocialSweatAdoptionMetricsRow | null) => {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: row ?? null, error: null });
  return chain;
};

const setupSupabaseQueries = (sessions: SessionRow[] = [], adoptionRow?: SocialSweatAdoptionMetricsRow | null) => {
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
    if (table === "social_sweat_adoption_metrics") {
      return createAdoptionChain(adoptionRow ?? null);
    }
    return createSelectOrderChain([]);
  });
};

describe("AdminDashboard", () => {
  const originalAllowlist = process.env.NEXT_PUBLIC_ADMIN_EMAILS;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = "ops@example.com";
    mockFetch.mockResolvedValue({ 
      ok: true, 
      json: async () => ({ 
        disputes: [], 
        total: 0, 
        statusCounts: { open: 0, reviewing: 0, resolved: 0, dismissed: 0 }, 
      }) 
    } as unknown as Response);
    (global as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = originalAllowlist;
    (global as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  it("hydrates Plan another links with venue metadata", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        disputes: [],
        total: 3,
        statusCounts: { open: 3, reviewing: 1, resolved: 4, dismissed: 0 },
      }),
    } as unknown as Response);
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

          const navPill = await screen.findByTestId("admin-dispute-nav-pill");
          expect(navPill).toHaveTextContent("3");
    expect(await screen.findByText(/All Sessions/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/disputes?status=open&limit=1", { credentials: "include" }),
    );
    const summaryHeading = await screen.findByText(/Reliability disputes/i);
    const summaryRow = summaryHeading.closest("div");
    expect(summaryRow).not.toBeNull();
    expect(within(summaryRow as HTMLElement).getByText(/Open:\s*3/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/In review/i)).toHaveTextContent(/In review: 1/i));
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
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId("admin-dispute-nav-pill")).toBeNull();
  });

  it("renders doWhat adoption metrics when Supabase returns data", async () => {
    const adoptionRow: SocialSweatAdoptionMetricsRow = {
      total_profiles: 100,
      sport_step_complete_count: 26,
      sport_skill_member_count: 24,
      trait_goal_count: 70,
      pledge_ack_count: 55,
      fully_ready_count: 42,
      user_sport_profile_rows: 80,
    };
    mockGetUser.mockResolvedValue({ data: { user: { email: "ops@example.com" } } });
    setupSupabaseQueries([], adoptionRow);

    render(<AdminDashboard />);

    const readinessHeading = await screen.findByText(/doWhat Readiness/i);
    expect(readinessHeading).toBeInTheDocument();
    expect(screen.getByText(/100 profiles tracked/i)).toBeInTheDocument();

    const sportCard = screen.getByText("Sport & skill complete").closest("div");
    expect(sportCard).not.toBeNull();
    expect(within(sportCard as HTMLElement).getByText("26")).toBeInTheDocument();
    expect(within(sportCard as HTMLElement).getByText("26% of 100")).toBeInTheDocument();
    expect(within(sportCard as HTMLElement).getByText(/Primary sport/i)).toBeInTheDocument();

    const skillCard = screen.getByText("Skill level saved").closest("div");
    expect(skillCard).not.toBeNull();
    expect(within(skillCard as HTMLElement).getByText("24")).toBeInTheDocument();
    expect(within(skillCard as HTMLElement).getByText("24% of 100")).toBeInTheDocument();

    const traitCard = screen.getByText(/Trait goal \(5\)/i).closest("div");
    expect(traitCard).not.toBeNull();
    expect(within(traitCard as HTMLElement).getByText("70")).toBeInTheDocument();
    expect(within(traitCard as HTMLElement).getByText("70% of 100")).toBeInTheDocument();

    const pledgeCard = screen.getByText(/Reliability pledge/i).closest("div");
    expect(pledgeCard).not.toBeNull();
    expect(within(pledgeCard as HTMLElement).getByText("55")).toBeInTheDocument();

    const readyCard = screen.getByText("Fully ready").closest("div");
    expect(readyCard).not.toBeNull();
    expect(within(readyCard as HTMLElement).getByText("42")).toBeInTheDocument();
    expect(within(readyCard as HTMLElement).getByText(/Traits \+ sport \+ pledge complete/i)).toBeInTheDocument();
  });

  it("shows an empty state when the adoption view has no data", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: "ops@example.com" } } });
    setupSupabaseQueries();

    render(<AdminDashboard />);

    expect(await screen.findByText(/No profiles available yet/i)).toBeInTheDocument();
  });
});
