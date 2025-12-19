import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { ReliabilityPledge } from "../ReliabilityPledge";

const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockRouterPrefetch = jest.fn();

jest.mock("@/lib/supabase/browser", () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    prefetch: mockRouterPrefetch,
  }),
}));

type ProfilesBuilder = {
  select: jest.Mock;
  eq: jest.Mock;
  maybeSingle: jest.Mock;
  update: jest.Mock;
  updateEq: jest.Mock;
};

const buildProfilesBuilder = (): ProfilesBuilder => {
  const builder: Partial<ProfilesBuilder> = {};
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn(() => builder);
  builder.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  const updateEq = jest.fn().mockResolvedValue({ error: null });
  builder.updateEq = updateEq;
  builder.update = jest.fn(() => ({ eq: updateEq }));
  return builder as ProfilesBuilder;
};

const COMMITMENT_TITLES = [
  "Confirm plans early",
  "Arrive warmed up",
  "Free your spot instantly",
  "Respect every crew",
];

let profilesBuilder: ProfilesBuilder;

describe("ReliabilityPledge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    profilesBuilder = buildProfilesBuilder();
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profilesBuilder;
      throw new Error(`Unexpected table ${table}`);
    });
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("enables saving once every commitment is confirmed", async () => {
    const user = userEvent.setup();
    render(<ReliabilityPledge />);

    await waitFor(() => expect(screen.queryByText(/Preparing your pledge/i)).not.toBeInTheDocument());

    const saveButton = screen.getByRole("button", { name: /Lock your commitment/i });
    expect(saveButton).toBeDisabled();

    for (const title of COMMITMENT_TITLES) {
      await user.click(screen.getByRole("button", { name: new RegExp(title, "i") }));
    }

    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => {
      expect(profilesBuilder.update).toHaveBeenCalledWith(expect.objectContaining({ reliability_pledge_version: "v1" }));
      expect(profilesBuilder.updateEq).toHaveBeenCalledWith("id", "user-123");
      expect(mockRouterPrefetch).toHaveBeenCalledWith("/profile");
    });
  });

  it("prefills commitments plus success messaging when already acknowledged", async () => {
    profilesBuilder.maybeSingle.mockResolvedValue({
      data: { reliability_pledge_ack_at: "2025-12-01T00:00:00.000Z", reliability_pledge_version: "v1" },
      error: null,
    });

    render(<ReliabilityPledge />);

    await waitFor(() => expect(screen.getByText(/Thanks for keeping every crew reliable/i)).toBeInTheDocument());
    const firstCommitment = screen.getByRole("button", { name: /Confirm plans early/i });
    expect(firstCommitment).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Update pledge/i })).toBeInTheDocument();
  });

  it("surfaces an auth error when supabase returns no user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    render(<ReliabilityPledge />);

    await waitFor(() => expect(screen.getByText(/Please sign in to continue/i)).toBeInTheDocument());
  });
});
