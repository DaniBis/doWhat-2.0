import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { OnboardingNavLink } from "../OnboardingNavLink";

jest.mock("@/lib/supabase/browser", () => {
  const auth = { getUser: jest.fn() };
  const from = jest.fn();
  return { supabase: { auth, from } };
});

jest.mock("@dowhat/shared", () => {
  const actual = jest.requireActual("@dowhat/shared");
  return {
    ...actual,
    trackOnboardingEntry: jest.fn(),
  };
});

const supabaseModule = jest.requireMock("@/lib/supabase/browser") as {
  supabase: {
    auth: { getUser: jest.Mock };
    from: jest.Mock;
  };
};

const { supabase } = supabaseModule;
const { trackOnboardingEntry } = jest.requireMock("@dowhat/shared") as {
  trackOnboardingEntry: jest.Mock;
};

const createProfilesQuery = (data: { primary_sport: string | null; reliability_pledge_ack_at: string | null }) => {
  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn(() => builder);
  builder.maybeSingle = jest.fn(async () => ({ data, error: null }));
  return builder;
};

const createTraitsQuery = (count: number) => {
  const eq = jest.fn().mockResolvedValue({ data: null, count, error: null });
  return {
    select: jest.fn(() => ({ eq })),
  };
};

function mockSupabaseResponses({
  user,
  traitsCount,
  primarySport = null,
  pledgeAck = null,
}: {
  user: { id: string } | null;
  traitsCount?: number;
  primarySport?: string | null;
  pledgeAck?: string | null;
}) {
  supabase.auth.getUser.mockResolvedValue({ data: { user } });
  supabase.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return createProfilesQuery({ primary_sport: primarySport ?? null, reliability_pledge_ack_at: pledgeAck ?? null });
    }
    if (table === "user_base_traits") {
      return createTraitsQuery(traitsCount ?? 0);
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

describe("OnboardingNavLink", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    trackOnboardingEntry.mockClear();
  });

  it("does not render when the user is signed out", async () => {
    mockSupabaseResponses({ user: null, traitsCount: 0 });

    const { container } = render(<OnboardingNavLink />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("renders a Finish onboarding pill when steps remain", async () => {
    mockSupabaseResponses({ user: { id: "user-123" }, traitsCount: 2, primarySport: null, pledgeAck: null });

    render(<OnboardingNavLink />);

    await waitFor(() => expect(screen.getByText(/Finish onboarding/i)).toBeInTheDocument());
    expect(screen.getByText("3")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Finish onboarding/i });
    expect(link).toHaveAttribute("href", "/onboarding");

    await userEvent.click(link);
    expect(trackOnboardingEntry).toHaveBeenCalledWith({ source: "nav", platform: "web", pendingSteps: 3 });
  });

  it("hides the pill once every step is complete", async () => {
    mockSupabaseResponses({ user: { id: "user-123" }, traitsCount: 5, primarySport: "padel", pledgeAck: "2025-12-01T00:00:00.000Z" });

    const { container } = render(<OnboardingNavLink />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
