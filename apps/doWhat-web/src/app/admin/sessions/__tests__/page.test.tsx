import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import AdminSessions from "../page";
import { buildSessionCloneQuery } from "@/lib/adminPrefill";

jest.mock("@/components/SaveToggleButton", () => ({
  __esModule: true,
  default: () => <div data-testid="save-toggle" />,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
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

jest.mock("@/lib/adminPrefill", () => ({
  buildSessionCloneQuery: jest.fn(),
}));

const mockedBuildSessionCloneQuery = buildSessionCloneQuery as jest.MockedFunction<typeof buildSessionCloneQuery>;

const createSessionsQuery = (rows: unknown[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockResolvedValue({ data: rows, error: null });
  return chain;
};

describe("AdminSessions", () => {
  const originalAllow = process.env.NEXT_PUBLIC_ADMIN_EMAILS;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = "ops@example.com";
    mockedBuildSessionCloneQuery.mockReturnValue({});
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = originalAllow;
  });

  it("passes venue metadata into the Plan another clone helper", async () => {
    const rows = [
      {
        id: "session-1",
        activity_id: "act-1",
        venue_id: "venue-1",
        starts_at: "2025-12-10T10:00:00.000Z",
        ends_at: "2025-12-10T12:00:00.000Z",
        price_cents: 3500,
        activities: { name: "Morning Flow", activity_types: ["tier3-run"] },
        venues: { name: "Central Park", address: "123 Park Ave", lat: 10.1, lng: -20.2 },
      },
    ];
    mockGetUser.mockResolvedValue({ data: { user: { email: "ops@example.com" } } });
    mockFrom.mockImplementation(() => createSessionsQuery(rows));

    render(<AdminSessions />);

    expect(await screen.findByText("Morning Flow")).toBeInTheDocument();
    const planLink = screen.getByRole("link", { name: /Plan another session/i });
    expect(planLink).toBeInTheDocument();

    await waitFor(() => expect(mockedBuildSessionCloneQuery).toHaveBeenCalled());
    const payload = mockedBuildSessionCloneQuery.mock.calls[0][0];
    expect(payload).toMatchObject({
      activityId: "act-1",
      activityName: "Morning Flow",
      activityTypes: ["tier3-run"],
      venueId: "venue-1",
      venueName: "Central Park",
      venueAddress: "123 Park Ave",
      venueLat: 10.1,
      venueLng: -20.2,
      priceCents: 3500,
      startsAt: "2025-12-10T10:00:00.000Z",
      endsAt: "2025-12-10T12:00:00.000Z",
    });
    expect(mockedBuildSessionCloneQuery).toHaveBeenCalledWith(expect.any(Object), {
      source: "admin_sessions_table",
    });
  });

  it("locks non-admin users out", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: "viewer@example.com" } } });
    mockFrom.mockImplementation(() => createSessionsQuery([]));

    render(<AdminSessions />);

    expect(await screen.findByText(/You don['’]t have access to this page/i)).toBeInTheDocument();
    expect(screen.getByText(/Signed in as: viewer@example.com/i)).toBeInTheDocument();
  });
});
