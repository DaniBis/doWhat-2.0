import { act, render, screen, waitFor } from "@testing-library/react";

import SessionAttendanceBadges from "../SessionAttendanceBadges";

const ORIGINAL_FETCH = global.fetch;
const mockResponse = <T,>(data: T, ok = true) =>
  ({
    ok,
    json: async () => data,
  }) as unknown as Response;

describe("SessionAttendanceBadges", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    jest.useRealTimers();
    jest.clearAllTimers();
  });

  it("returns null when no session id is provided", () => {
    const { container } = render(<SessionAttendanceBadges sessionId={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fetches attendance summary and renders counts", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockResponse({ counts: { going: 3, interested: 2, declined: 0, total: 5, verified: 1 } })
    );

    render(<SessionAttendanceBadges sessionId="session-123" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/sessions/session-123/attendance",
        expect.objectContaining({ cache: "no-store" })
      );
    });

    expect(await screen.findByText("Going: 3")).toBeInTheDocument();
    expect(screen.getByText("Interested: 2")).toBeInTheDocument();
    expect(screen.getByText("GPS verified: 1")).toBeInTheDocument();
  });

  it("refreshes when the session-attendance-updated event fires", async () => {
    jest.useFakeTimers();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockResponse({ counts: { going: 1, interested: 0, declined: 0, total: 1, verified: 0 } })
      )
      .mockResolvedValueOnce(
        mockResponse({ counts: { going: 2, interested: 1, declined: 0, total: 3, verified: 1 } })
      );

    render(<SessionAttendanceBadges sessionId="session-456" />);

    expect(await screen.findByText("Going: 1")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("session-attendance-updated", {
          detail: { sessionId: "session-456" },
        })
      );
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText("Going: 2")).toBeInTheDocument();
    expect(screen.getByText("Interested: 1")).toBeInTheDocument();
    expect(screen.getByText("GPS verified: 1")).toBeInTheDocument();
  });
});
