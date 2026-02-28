import { render, screen, waitFor } from "@testing-library/react";

import SessionAttendanceList from "../SessionAttendanceList";

let rows: Array<Record<string, unknown>> = [];

jest.mock("@/lib/supabase/browser", () => {
  const onMock = jest.fn(function on(): any {
    return channelMock;
  });
  const channelMock: any = {
    on: onMock,
    subscribe: jest.fn(() => ({})),
  };

  return {
    supabase: {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            in: jest.fn(async () => ({ data: rows, error: null })),
          })),
        })),
      })),
      channel: jest.fn(() => channelMock),
      removeChannel: jest.fn(),
    },
  };
});

describe("SessionAttendanceList", () => {
  beforeEach(() => {
    rows = [];
  });

  it("hides declined attendees by default", async () => {
    rows = [
      {
        session_id: "session-1",
        user_id: "user-1",
        status: "going",
        attendance_status: "registered",
        profiles: { id: "user-1", full_name: "Going User", username: "going" },
      },
      {
        session_id: "session-1",
        user_id: "user-2",
        status: "declined",
        attendance_status: "late_cancel",
        profiles: { id: "user-2", full_name: "Declined User", username: "declined" },
      },
    ];

    render(<SessionAttendanceList sessionId="session-1" variant="detailed" />);

    expect(await screen.findByText("Going User")).toBeInTheDocument();
    expect(screen.queryByText("Declined User")).not.toBeInTheDocument();
  });

  it("shows declined attendees when includeDeclined is enabled", async () => {
    rows = [
      {
        session_id: "session-2",
        user_id: "user-9",
        status: "declined",
        attendance_status: "late_cancel",
        profiles: { id: "user-9", full_name: "Aston", username: "aston" },
      },
    ];

    render(<SessionAttendanceList sessionId="session-2" variant="detailed" includeDeclined />);

    expect(await screen.findByText("Aston")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Declined")).toBeInTheDocument();
    });
  });
});
