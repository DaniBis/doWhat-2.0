import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { SportSelector } from "../SportSelector";
import { getSkillLabels } from "@dowhat/shared";

const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockRouterPush = jest.fn();
const mockRouterPrefetch = jest.fn().mockResolvedValue(undefined);
const trackOnboardingEntry = jest.fn();
const mockEnsureUserRow = jest.fn().mockResolvedValue(true);

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
    push: (...args: unknown[]) => mockRouterPush(...args),
    prefetch: (...args: unknown[]) => mockRouterPrefetch(...args),
  }),
}));

jest.mock("@/lib/users/ensureUserRow", () => ({
  ensureUserRow: (...args: unknown[]) => mockEnsureUserRow(...args),
}));

jest.mock("@dowhat/shared", () => {
  const actual = jest.requireActual("@dowhat/shared");
  return {
    ...actual,
    trackOnboardingEntry: (...args: unknown[]) => trackOnboardingEntry(...args),
  };
});

type QueryBuilder = {
  select: jest.MockedFunction<any>;
  eq: jest.MockedFunction<any>;
  maybeSingle: jest.MockedFunction<any>;
  upsert: jest.MockedFunction<any>;
};

const createQueryBuilder = (): QueryBuilder => {
  const builder: Partial<QueryBuilder> = {};
  builder.select = jest.fn().mockReturnValue(builder);
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  builder.upsert = jest.fn().mockResolvedValue({ error: null });
  return builder as QueryBuilder;
};

let profileQuery: QueryBuilder;
let sportProfileQuery: QueryBuilder;

describe("SportSelector", () => {
  const padelSkills = getSkillLabels("padel");
  const firstPadelSkill = padelSkills[0] ?? "1.0 - New to the sport";
  const secondPadelSkill = padelSkills[1] ?? firstPadelSkill;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouterPrefetch.mockResolvedValue(undefined);
    mockEnsureUserRow.mockClear();
    mockEnsureUserRow.mockResolvedValue(true);
    profileQuery = createQueryBuilder();
    sportProfileQuery = createQueryBuilder();
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery;
      if (table === "user_sport_profiles") return sportProfileQuery;
      return createQueryBuilder();
    });
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
    profileQuery.maybeSingle.mockResolvedValue({ data: { primary_sport: null, play_style: null }, error: null });
    sportProfileQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("renders sport choices and hides skill chips until a sport is picked", async () => {
    const user = userEvent.setup();
    render(<SportSelector />);

    await screen.findByText(/Pick your primary sport/i);

    const padelButton = screen.getByRole("button", { name: /Padel/i });
    expect(padelButton).toBeInTheDocument();
    expect(screen.getByText(/Choose a primary sport first/i)).toBeInTheDocument();

    await user.click(padelButton);
    await waitFor(() => expect(screen.getByRole("button", { name: firstPadelSkill })).toBeInTheDocument());
  });

  it("saves the selected sport, skill level, and play style", async () => {
    const user = userEvent.setup();
    render(<SportSelector />);
    await screen.findByText(/Pick your primary sport/i);

    await waitFor(() => expect(profileQuery.select).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /Padel/i }));
    const skillChip = await screen.findByRole("button", { name: secondPadelSkill });
    await user.click(skillChip);
    await waitFor(() => expect(skillChip).toHaveAttribute("aria-pressed", "true"));
    const funButton = screen.getByRole("button", { name: /^Fun/i });
    await user.click(funButton);
    await waitFor(() => expect(funButton).toHaveAttribute("aria-pressed", "true"));
    const saveButton = screen.getByRole("button", { name: /Save preferences/i });

    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => {
      expect(profileQuery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: "user-123", primary_sport: "padel", play_style: "fun" }),
        { onConflict: "id" }
      );
      expect(sportProfileQuery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: "user-123", sport: "padel" }),
        { onConflict: "user_id,sport" }
      );
      expect(mockRouterPush).toHaveBeenCalledWith("/onboarding/reliability-pledge");
      expect(trackOnboardingEntry).toHaveBeenCalledWith({
        source: "sport-selector",
        platform: "web",
        step: "pledge",
        steps: ["pledge"],
        pendingSteps: 1,
        nextStep: "/onboarding/reliability-pledge",
      });
    });
  });
});
