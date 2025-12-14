import React from "react";
import { render, screen } from "@testing-library/react";

import AdminActivities from "../page";

const mockUseSearchParams = jest.fn();

jest.mock("next/navigation", () => ({
  __esModule: true,
  ...jest.requireActual("next/navigation"),
  useSearchParams: () => mockUseSearchParams(),
}));

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

const createActivitiesQuery = (rows: unknown[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.returns = jest.fn().mockResolvedValue({ data: rows, error: null });
  return chain;
};

describe("AdminActivities", () => {
  const originalAllow = process.env.NEXT_PUBLIC_ADMIN_EMAILS;
  const originalBypass = process.env.NEXT_PUBLIC_E2E_ADMIN_BYPASS;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = "ops@example.com";
    process.env.NEXT_PUBLIC_E2E_ADMIN_BYPASS = undefined;
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = originalAllow;
    process.env.NEXT_PUBLIC_E2E_ADMIN_BYPASS = originalBypass;
  });

  it("locks non-admin users out", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: "viewer@example.com" } } });
    mockFrom.mockImplementation(() => createActivitiesQuery([]));

    render(<AdminActivities />);

    expect(await screen.findByText(/You don['’]t have access to this page/i)).toBeInTheDocument();
    expect(screen.getByText(/Signed in as: viewer@example.com/i)).toBeInTheDocument();
  });

  it("honors the e2e bypass in non-production envs", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("e2e=1"));
    mockFrom.mockImplementation(() => createActivitiesQuery([{ id: "activity-1", name: "Chess Club" }]));

    render(<AdminActivities />);

    expect(await screen.findByText("Chess Club")).toBeInTheDocument();
    expect(mockGetUser).not.toHaveBeenCalled();
  });
});
