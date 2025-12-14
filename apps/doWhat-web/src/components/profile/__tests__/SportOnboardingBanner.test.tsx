import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { SportOnboardingBanner } from "../SportOnboardingBanner";

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

describe("SportOnboardingBanner", () => {
  beforeEach(() => {
    trackOnboardingEntry.mockClear();
  });

  it("shows the CTA copy and link", () => {
    render(<SportOnboardingBanner />);

    expect(screen.getByText(/set your sport & skill/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /go to sport onboarding/i });
    expect(link).toHaveAttribute("href", "/onboarding/sports");
  });

  it("mentions the current skill level when provided", () => {
    render(<SportOnboardingBanner skillLevel="3.5 - Consistent rallies" />);

    expect(screen.getByText(/Current skill:/i)).toBeInTheDocument();
    expect(screen.getByText(/3\.5 - Consistent rallies/i)).toBeInTheDocument();
  });

  it("tracks onboarding entry with default steps when CTA is clicked", async () => {
    const user = userEvent.setup();
    render(<SportOnboardingBanner />);

    await user.click(screen.getByRole("link", { name: /go to sport onboarding/i }));

    expect(trackOnboardingEntry).toHaveBeenCalledWith({
      source: "sport-banner",
      platform: "web",
      step: "sport",
      steps: ["sport"],
      pendingSteps: 1,
      nextStep: "/onboarding/sports",
    });
  });

  it("passes through provided onboarding steps", async () => {
    const user = userEvent.setup();
    render(<SportOnboardingBanner steps={["sport", "pledge"]} />);

    await user.click(screen.getByRole("link", { name: /go to sport onboarding/i }));

    expect(trackOnboardingEntry).toHaveBeenLastCalledWith({
      source: "sport-banner",
      platform: "web",
      step: "sport",
      steps: ["sport", "pledge"],
      pendingSteps: 2,
      nextStep: "/onboarding/sports",
    });
  });
});
