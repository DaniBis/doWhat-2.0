import React from "react";
import "@testing-library/jest-dom/jest-globals";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

jest.mock("@/lib/supabase/server", () => ({
  __esModule: true,
  createClient: jest.fn(),
}));

jest.mock("@dowhat/shared", () => {
  const actual = jest.requireActual("@dowhat/shared");
  return {
    ...actual,
    trackOnboardingEntry: jest.fn(),
  };
});

jest.mock("next/link", () => {
  return ({ children, href, onClick, ...rest }: { children: React.ReactNode; href: string; onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </a>
  );
});

const { createClient: createClientMock } = jest.requireMock("@/lib/supabase/server") as {
  createClient: jest.MockedFunction<() => SupabaseClient>;
};
const redirectMock = redirect as jest.MockedFunction<typeof redirect>;
const { trackOnboardingEntry } = jest.requireMock("@dowhat/shared") as {
  trackOnboardingEntry: jest.Mock;
};

type MockSupabaseClient = {
  auth: {
    getUser: jest.MockedFunction<() => Promise<{ data: { user: { id: string } | null } }>>;
  };
  from: jest.MockedFunction<(table: string) => any>;
};

type BuildClientOptions = {
  user: { id: string } | null;
  traitCount?: number;
  primarySport?: string | null;
  pledgeAck?: string | null;
};

const buildMockClient = ({ user, traitCount = 0, primarySport = null, pledgeAck = null }: BuildClientOptions): MockSupabaseClient => {
  const profileQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: { primary_sport: primarySport, reliability_pledge_ack_at: pledgeAck }, error: null }),
  };
  const traitQuery = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, count: traitCount, error: null }),
    }),
  };
  return {
    auth: {
      getUser: jest.fn(async () => ({ data: { user } })),
    },
    from: jest.fn((table: string) => {
      if (table === "profiles") return profileQuery;
      if (table === "user_base_traits") return traitQuery;
      throw new Error(`Unexpected table ${table}`);
    }),
  };
};

describe("OnboardingHomePage", () => {
  const loadOnboardingPage = async () => (await import("../page")).default;

  beforeEach(() => {
    jest.clearAllMocks();
    redirectMock.mockReset();
    trackOnboardingEntry.mockClear();
  });

  it("redirects unauthenticated visitors to login", async () => {
    const mockClient = buildMockClient({ user: null });
    createClientMock.mockReturnValue(mockClient as unknown as SupabaseClient);
    redirectMock.mockImplementation(() => {
      throw new Error("redirect called");
    });

    const OnboardingPage = await loadOnboardingPage();
    await expect(OnboardingPage()).rejects.toThrow("redirect called");
    expect(redirectMock).toHaveBeenCalledWith("/auth/login?next=%2Fonboarding");
    expect(mockClient.auth.getUser).toHaveBeenCalled();
  });

  it("renders completion states for every step when signed in", async () => {
    const mockClient = buildMockClient({
      user: { id: "user-123" },
      traitCount: 5,
      primarySport: "padel",
      pledgeAck: "2025-12-01T00:00:00.000Z",
    });
    createClientMock.mockReturnValue(mockClient as unknown as SupabaseClient);

    const OnboardingPage = await loadOnboardingPage();
    const ui = await OnboardingPage();
    render(ui);

    expect(screen.getByText("Finish the Step 0 checklist")).toBeInTheDocument();
    expect(screen.getByText(/Completed \(5 vibes\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Primary sport: padel/i)).toBeInTheDocument();
    expect(screen.getByText(/Acknowledged /i)).toBeInTheDocument();

    expect(screen.getAllByRole("link", { name: /Review step/i })).toHaveLength(3);
  });

  it("tracks analytics when a step CTA is clicked", async () => {
    const mockClient = buildMockClient({
      user: { id: "user-123" },
      traitCount: 2,
      primarySport: null,
      pledgeAck: null,
    });
    createClientMock.mockReturnValue(mockClient as unknown as SupabaseClient);

    const OnboardingPage = await loadOnboardingPage();
    const ui = await OnboardingPage();
    render(ui);

    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: /Go to trait onboarding/i }));

    expect(trackOnboardingEntry).toHaveBeenCalledWith({ source: "onboarding-card", platform: "web", step: "traits" });
  });
});
