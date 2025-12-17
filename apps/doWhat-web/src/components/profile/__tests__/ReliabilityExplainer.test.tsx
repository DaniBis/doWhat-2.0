import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReliabilityExplainer } from "../ReliabilityExplainer";

jest.mock("@dowhat/shared", () => {
  const actual = jest.requireActual("@dowhat/shared");
  return {
    ...actual,
    trackReliabilityAttendanceLogViewed: jest.fn(),
  };
});

const { trackReliabilityAttendanceLogViewed } = jest.requireMock("@dowhat/shared") as {
  trackReliabilityAttendanceLogViewed: jest.Mock;
};

jest.mock("next/link", () => {
  return ({
    children,
    href,
    onClick,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  }) => (
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

describe("ReliabilityExplainer", () => {
  beforeEach(() => {
    trackReliabilityAttendanceLogViewed.mockClear();
  });
  const attendance = {
    attended30: 8,
    noShow30: 1,
    lateCancel30: 1,
    excused30: 0,
    attended90: 18,
    noShow90: 1,
    lateCancel90: 0,
    excused90: 0,
  };
  const strongReliability = {
    score: 74.2,
    confidence: 0.81,
    components: { AS30: 0.72, AS90: 0.81 },
  };
  const moderateReliability = {
    score: 60,
    confidence: 0.35,
    components: { AS30: 0.6, AS90: 0.35 },
  };

  it("renders reliability metrics, badge glossary, and CTA", async () => {
    render(
      <ReliabilityExplainer reliability={strongReliability} attendance={attendance} />
    );

    expect(screen.getByText(/Reliability index/i)).toBeInTheDocument();
    expect(screen.getByText("74")).toBeInTheDocument();
    expect(screen.getByText("81%")).toBeInTheDocument();
    expect(screen.getByText(/Badges explained/i)).toBeInTheDocument();
    expect(screen.getByText("Going")).toBeInTheDocument();
    expect(screen.getByText("Interested")).toBeInTheDocument();
    expect(screen.getByText("GPS verified")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /View attendance log/i });
    expect(link).toHaveAttribute("href", "/my/attendance");
    expect(screen.getByText(/Need to contest a result/i)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(link);
    expect(trackReliabilityAttendanceLogViewed).toHaveBeenCalledWith({
      platform: "web",
      surface: "profile-reliability-card",
    });
  });

  it("summarizes attendance rates with percentages", () => {
    render(
      <ReliabilityExplainer reliability={moderateReliability} attendance={attendance} />
    );

    expect(screen.getByText("8 / 10 · 80%"))
      .toBeInTheDocument();
    expect(screen.getByText("1 · 5%"))
      .toBeInTheDocument();
  });
  
  it("guides members when no reliability score is available", () => {
    render(
      <ReliabilityExplainer
        reliability={null}
        attendance={{ attended30: 0, noShow30: 0, lateCancel30: 0, excused30: 0, attended90: 0, noShow90: 0, lateCancel90: 0, excused90: 0 }}
      />
    );

    expect(
      screen.getByText(
        "Attend a few confirmed sessions and check in so we can calculate your reliability score.",
      ),
    ).toBeInTheDocument();
  });
});
