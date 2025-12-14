import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { OnboardingStep } from "@dowhat/shared";

import { OnboardingProgressBanner } from "../OnboardingProgressBanner";

jest.mock("@dowhat/shared", () => {
  const actual = jest.requireActual("@dowhat/shared");
  return {
    ...actual,
    trackOnboardingEntry: jest.fn(),
  };
});

const { trackOnboardingEntry } = jest.requireMock("@dowhat/shared") as {
  trackOnboardingEntry: jest.Mock;
};

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

describe("OnboardingProgressBanner", () => {
  beforeEach(() => {
    trackOnboardingEntry.mockClear();
  });

  it("lists every pending onboarding step", () => {
    const steps: OnboardingStep[] = ["traits", "sport"];
    render(<OnboardingProgressBanner steps={steps} />);

    expect(screen.getByText(/Finish your Social Sweat onboarding/i)).toBeInTheDocument();
    expect(screen.getByText("Pick 5 base traits")).toBeInTheDocument();
    expect(screen.getByText("Set your sport & skill")).toBeInTheDocument();
    expect(screen.getByText(/Next up: Pick 5 base traits/i)).toBeInTheDocument();
    expect(
      screen.getByText(/2 steps remain — finish them so hosts prioritize you for open slots./i),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Go to next step/i });
    expect(link).toHaveAttribute("href", "/onboarding/traits");
  });

  it("hides itself when there are no steps", () => {
    const { container } = render(<OnboardingProgressBanner steps={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it("shows single-step encouragement copy", () => {
    render(<OnboardingProgressBanner steps={["pledge"]} />);

    expect(
      screen.getByText(/Just one more action to unlock full Social Sweat access./i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Next up: Confirm the reliability pledge/i)).toBeInTheDocument();
  });

  it("tracks when the onboarding hub link is clicked", async () => {
    const steps: OnboardingStep[] = ["traits", "pledge"];
    const user = userEvent.setup();
    render(<OnboardingProgressBanner steps={steps} />);

    await user.click(screen.getByRole("link", { name: /Go to next step/i }));

    expect(trackOnboardingEntry).toHaveBeenCalledWith({
      source: "profile-banner",
      platform: "web",
      steps,
      pendingSteps: steps.length,
      step: "traits",
      nextStep: "/onboarding/traits",
    });
  });
});
