import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { ReliabilityPledgeBanner } from "../ReliabilityPledgeBanner";

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

describe("ReliabilityPledgeBanner", () => {
  beforeEach(() => {
    trackOnboardingEntry.mockClear();
  });

  it("renders the CTA copy and link", () => {
    render(<ReliabilityPledgeBanner />);

    expect(screen.getByText(/Lock your reliability pledge/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Review pledge/i });
    expect(link).toHaveAttribute("href", "/onboarding/reliability-pledge");
  });

  it("mentions the previous acknowledgement date when provided", () => {
    render(<ReliabilityPledgeBanner lastAcknowledgedAt="2025-12-01T00:00:00.000Z" />);

    expect(screen.getByText(/You last confirmed the pledge on/i)).toBeInTheDocument();
  });

  it("tracks onboarding entry when the CTA is clicked", async () => {
    const user = userEvent.setup();
    render(<ReliabilityPledgeBanner />);

    await user.click(screen.getByRole("link", { name: /Review pledge/i }));

    expect(trackOnboardingEntry).toHaveBeenCalledWith({ source: "pledge-banner", platform: "web", step: "pledge" });
  });
});
