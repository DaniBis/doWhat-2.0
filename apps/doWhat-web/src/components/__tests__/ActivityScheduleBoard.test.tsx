import React from "react";
import { render } from "@testing-library/react";
import { buildSessionSavePayload } from "@dowhat/shared";

import ActivityScheduleBoard from "../ActivityScheduleBoard";

const saveToggleSpy = jest.fn();

jest.mock("../SaveToggleButton", () => (props: unknown) => {
  saveToggleSpy(props);
  return <div data-testid="schedule-save-toggle" />;
});

jest.mock("../SessionAttendanceList", () => () => <div data-testid="schedule-attendance-list" />);
jest.mock("../SessionAttendanceQuickActions", () => () => <div data-testid="schedule-attendance-quick-actions" />);
jest.mock("../WebActivityIcon", () => () => <span data-testid="web-activity-icon" />);

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

jest.mock("@dowhat/shared", () => ({
  buildSessionSavePayload: jest.fn(),
}));

const mockedBuildSessionSavePayload = buildSessionSavePayload as jest.MockedFunction<typeof buildSessionSavePayload>;

describe("ActivityScheduleBoard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    saveToggleSpy.mockClear();
    mockedBuildSessionSavePayload.mockReset();
  });

  it("enriches session Save payloads with venue metadata", () => {
    mockedBuildSessionSavePayload.mockReturnValue({
      id: "session-primary",
      name: "Morning Flow",
      venueId: "shared-venue",
      metadata: { base: "value" },
    });

    const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();

    const activity = { id: "activity-1", name: "Morning Flow" };
    const sessions = [
      {
        id: "session-primary",
        starts_at: futureStart,
        ends_at: futureEnd,
        price_cents: 1500,
        description: "Bring a mat",
        venue_id: null,
        venues: { id: "venue-101", name: "Community Hub", lat: 12.34, lng: 56.78 },
      },
    ];

    render(<ActivityScheduleBoard activity={activity} sessions={sessions} currentUserId="host-1" />);

    expect(mockedBuildSessionSavePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "session-primary",
        activities: expect.objectContaining({ id: "activity-1", name: "Morning Flow" }),
        venues: { name: "Community Hub" },
      }),
      { source: "web_activity_schedule" },
    );

    const toggleProps = saveToggleSpy.mock.calls[0][0] as { payload: unknown };
    expect(toggleProps.payload).toEqual({
      id: "session-primary",
      name: "Morning Flow",
      venueId: "venue-101",
      metadata: {
        base: "value",
        venueId: "venue-101",
        venueLat: 12.34,
        venueLng: 56.78,
      },
      address: "Community Hub",
    });
  });
});
