import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { TraitVoteDialog } from "@/components/traits/TraitVoteDialog";
import { MAX_VOTE_TRAITS_PER_USER } from "@/lib/validation/traits";
import type { TraitOption } from "@/types/traits";
import { submitTraitVotesAction } from "@/app/actions/traits";

jest.mock("@/app/actions/traits", () => ({
  submitTraitVotesAction: jest.fn(),
}));

const traitResponseState: { data: TraitOption[]; error: null | { message: string } } = {
  data: [],
  error: null,
};

jest.mock("@/lib/supabase/browser", () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn(async () => ({ ...traitResponseState })),
      })),
    })),
  },
  __setTraitCatalog: (traits: TraitOption[]) => {
    traitResponseState.data = traits;
    traitResponseState.error = null;
  },
}));

const { __setTraitCatalog } = jest.requireMock("@/lib/supabase/browser") as {
  __setTraitCatalog: (traits: TraitOption[]) => void;
};

const mockSubmitAction = submitTraitVotesAction as jest.MockedFunction<typeof submitTraitVotesAction>;

const buildTraits = (count: number): TraitOption[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `trait-${index + 1}`,
    name: `Trait ${index + 1}`,
    color: "#10B981",
    icon: "Sparkles",
  }));

describe("TraitVoteDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setTraitCatalog(buildTraits(MAX_VOTE_TRAITS_PER_USER + 1));
    mockSubmitAction.mockResolvedValue({ ok: true, data: { sessionId: "session-1", votesInserted: 2 } });
  });

  const participants = [
    { id: "user-1", name: "Alex" },
    { id: "user-2", name: "Blair" },
  ];

  function openDialog() {
    fireEvent.click(screen.getByRole("button", { name: /post-session vibes/i }));
  }

  it("submits votes for selected participants", async () => {
    render(<TraitVoteDialog sessionId="session-1" participants={participants} />);

    openDialog();

    await screen.findAllByRole("button", { name: "Trait 1" });

    const userOneCard = within(screen.getByTestId("trait-voter-user-1"));
    fireEvent.click(userOneCard.getByRole("button", { name: "Trait 1" }));

    const userTwoCard = within(screen.getByTestId("trait-voter-user-2"));
    fireEvent.click(userTwoCard.getByRole("button", { name: "Trait 2" }));

    fireEvent.click(screen.getByRole("button", { name: /submit votes/i }));

    await waitFor(() => expect(mockSubmitAction).toHaveBeenCalledTimes(1));
    expect(mockSubmitAction).toHaveBeenCalledWith("session-1", {
      votes: [
        { toUserId: "user-1", traits: ["trait-1"] },
        { toUserId: "user-2", traits: ["trait-2"] },
      ],
    });

    await screen.findByText(/votes recorded/i);
  });

  it("clears all selections and disables submit when nothing is selected", async () => {
    render(<TraitVoteDialog sessionId="session-1" participants={participants} triggerLabel="Nominate" />);

    fireEvent.click(screen.getByRole("button", { name: /nominate/i }));

    await screen.findAllByRole("button", { name: "Trait 1" });

    const userOneCard = within(screen.getByTestId("trait-voter-user-1"));
    fireEvent.click(userOneCard.getByRole("button", { name: "Trait 1" }));

    expect(screen.getByText(/1 trait selected/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/clear all/i));

    expect(screen.getByText(/0 traits selected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit votes/i })).toBeDisabled();
  });

  it("shows an empty state and keeps submit disabled with no participants", async () => {
    render(<TraitVoteDialog sessionId="session-1" participants={[]} triggerLabel="Open" />);

    fireEvent.click(screen.getByRole("button", { name: /open/i }));

    await screen.findByText(/looks like you were the only attendee/i);
    expect(screen.getByRole("button", { name: /submit votes/i })).toBeDisabled();
  });
});
