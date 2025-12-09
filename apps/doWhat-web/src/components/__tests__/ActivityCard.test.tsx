import React from "react";
import { render } from "@testing-library/react";
import { buildActivitySavePayload } from "@dowhat/shared";

import ActivityCard from "../ActivityCard";

const saveToggleSpy = jest.fn();

jest.mock("../SaveToggleButton", () => (props: unknown) => {
  saveToggleSpy(props);
  return <div data-testid="save-toggle-mock" />;
});

jest.mock("../SessionAttendanceList", () => () => <div data-testid="session-attendance-list" />);
jest.mock("../SessionAttendanceQuickActions", () => () => <div data-testid="session-attendance-quick-actions" />);
jest.mock("../WebActivityIcon", () => () => <span data-testid="web-activity-icon" />);

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

jest.mock("@dowhat/shared", () => ({
  buildActivitySavePayload: jest.fn(),
}));

const mockedBuildActivitySavePayload = buildActivitySavePayload as jest.MockedFunction<typeof buildActivitySavePayload>;

describe("ActivityCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    saveToggleSpy.mockClear();
    mockedBuildActivitySavePayload.mockReset();
  });

  it("passes the enriched Save payload to SaveToggleButton", () => {
    const basePayload = {
      id: "activity-123",
      name: "Sunset Yoga",
      venueId: "shared-venue",
      metadata: { base: "value" },
    };
    mockedBuildActivitySavePayload.mockReturnValue(basePayload);

    const activity = { id: "activity-123", name: "Sunset Yoga", description: "Flow" };
    const sessions = [
      {
        id: "session-primary",
        created_by: "host-1",
        starts_at: "2025-12-10T10:00:00.000Z",
        ends_at: "2025-12-10T11:00:00.000Z",
        price_cents: 0,
        venue_id: null,
        venues: { id: "venue-meta", name: "Community Hub" },
      },
      {
        id: "session-extra",
        created_by: "host-2",
        starts_at: "2025-12-11T10:00:00.000Z",
        ends_at: "2025-12-11T11:00:00.000Z",
        price_cents: 1000,
        venue_id: "venue-extra",
        venues: { id: "venue-extra", name: "Annex" },
      },
    ];

    render(<ActivityCard activity={activity} sessions={sessions} currentUserId="host-1" />);

    expect(mockedBuildActivitySavePayload).toHaveBeenCalledWith(
      { id: "activity-123", name: "Sunset Yoga" },
      expect.arrayContaining([
        expect.objectContaining({
          id: "session-primary",
          activities: expect.objectContaining({ id: "activity-123", name: "Sunset Yoga" }),
        }),
        expect.objectContaining({ id: "session-extra" }),
      ]),
      { source: "web_activity_card" },
    );

    expect(saveToggleSpy).toHaveBeenCalledTimes(1);
    const toggleProps = saveToggleSpy.mock.calls[0][0] as { payload: unknown };
    expect(toggleProps.payload).toEqual({
      ...basePayload,
      venueId: "venue-meta",
      address: "Community Hub",
      metadata: {
        base: "value",
        primarySessionId: "session-primary",
      },
    });
  });
});
