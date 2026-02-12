import React from "react";
import { describe, beforeEach, it, expect, jest } from "@jest/globals";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import type { Mock } from "jest-mock";
import { router } from "expo-router";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("react-native/Libraries/Animated/NativeAnimatedHelper");

jest.mock("expo-router", () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
  },
}));

jest.mock("../../lib/supabase", () => {
  const state: {
    userId: string | null;
    profile: { reliability_pledge_ack_at: string | null; reliability_pledge_version: string | null };
    lastUpdatePayload: Record<string, unknown> | null;
    upsertError: { message: string; code?: string; details?: string } | null;
    updateError: { message: string } | null;
  } = {
    userId: "user-123",
    profile: { reliability_pledge_ack_at: null, reliability_pledge_version: null },
    lastUpdatePayload: null,
    upsertError: null,
    updateError: null,
  };

  const buildSelectChain = () => ({
    eq: jest.fn(() => ({
      maybeSingle: jest.fn(async () => ({ data: state.profile, error: null })),
    })),
  });

  const mockClient = {
    from: jest.fn((table: string) => {
      if (table !== "profiles") throw new Error(`Unexpected table: ${table}`);
      return {
        select: jest.fn(() => buildSelectChain()),
        upsert: jest.fn(async (payload: Record<string, unknown>) => {
          state.lastUpdatePayload = payload;
          return { error: state.upsertError };
        }),
        update: jest.fn((payload: Record<string, unknown>) => ({
          eq: jest.fn(async () => {
            state.lastUpdatePayload = payload;
            return { error: state.updateError };
          }),
        })),
      };
    }),
    auth: {
      getUser: jest.fn(async () => ({ data: { user: state.userId ? { id: state.userId } : null } })),
    },
  };

  const helpers = {
    reset: () => {
      state.userId = "user-123";
      state.profile = { reliability_pledge_ack_at: null, reliability_pledge_version: null };
      state.lastUpdatePayload = null;
      state.upsertError = null;
      state.updateError = null;
      mockClient.from.mockClear();
      mockClient.auth.getUser.mockClear();
    },
    setUserId: (id: string | null) => {
      state.userId = id;
    },
    setProfile: (profile: { reliability_pledge_ack_at: string | null; reliability_pledge_version: string | null }) => {
      state.profile = profile;
    },
    getLastUpdatePayload: () => state.lastUpdatePayload,
  };

  return {
    supabase: mockClient,
    __supabaseMock: helpers,
  };
});

const { __supabaseMock } = jest.requireMock("../../lib/supabase") as {
  __supabaseMock: {
    reset: () => void;
    setUserId: (id: string | null) => void;
    setProfile: (profile: { reliability_pledge_ack_at: string | null; reliability_pledge_version: string | null }) => void;
    getLastUpdatePayload: () => Record<string, unknown> | null;
  };
};

const { reset: resetSupabaseState, setUserId, setProfile, getLastUpdatePayload } = __supabaseMock;

// Import the screen after mocks are configured
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ReliabilityPledgeScreen = require("../onboarding/reliability-pledge").default as typeof import("../onboarding/reliability-pledge").default;

const replaceSpy = router.replace as Mock;

const COMMITMENT_TEST_IDS = ["confirm-attendance", "arrive-on-time", "release-spot", "respect-crew"];

const selectAllCommitments = (getByTestId: (testID: string) => unknown) => {
  for (const id of COMMITMENT_TEST_IDS) {
    const checkbox = getByTestId(`commitment-${id}`) as Parameters<typeof fireEvent.press>[0];
    fireEvent.press(checkbox);
  }
};

describe("ReliabilityPledgeScreen", () => {
  beforeEach(() => {
    resetSupabaseState();
    replaceSpy.mockReset();
  });

  it("requires all commitments before enabling the pledge", async () => {
    const { getByText, getByTestId } = render(<ReliabilityPledgeScreen />);

    await waitFor(() => expect(getByText("Reliability pledge")).toBeTruthy());
    const submitButton = getByTestId("reliability-pledge-submit");
    expect(submitButton).toBeDisabled();

    await waitFor(() => expect(getByTestId("commitment-confirm-attendance")).toBeTruthy());
    selectAllCommitments(getByTestId);
    await waitFor(() => expect(submitButton).not.toBeDisabled());
  });

  it("saves the pledge and navigates home", async () => {
    const { getByTestId } = render(<ReliabilityPledgeScreen />);

    await waitFor(() => expect(getByTestId("commitment-confirm-attendance")).toBeTruthy());
    selectAllCommitments(getByTestId);

    fireEvent.press(getByTestId("reliability-pledge-submit"));

    await waitFor(() => expect(getLastUpdatePayload()).not.toBeNull());
    expect(replaceSpy).toHaveBeenCalledWith("/(tabs)/home");
  });

  it("shows success copy when an existing pledge is stored", async () => {
    setProfile({ reliability_pledge_ack_at: "2025-12-10T00:00:00.000Z", reliability_pledge_version: "v1" });
    const { findByText } = render(<ReliabilityPledgeScreen />);

    await expect(findByText(/You accepted version/i)).resolves.toBeTruthy();
  });

  it("surfaces an auth error when no user session exists", async () => {
    setUserId(null);
    const { findByText } = render(<ReliabilityPledgeScreen />);

    await expect(findByText("Please sign in to continue.")).resolves.toBeTruthy();
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
