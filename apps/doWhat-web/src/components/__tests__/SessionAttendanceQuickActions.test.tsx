import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import SessionAttendanceQuickActions from "../SessionAttendanceQuickActions";

const ORIGINAL_FETCH = global.fetch;
const DEFAULT_COUNTS = { going: 0, interested: 0, declined: 0, total: 0, verified: 0 };

const mockResponse = <T,>(data: T, ok = true) =>
  ({
    ok,
    json: async () => data,
  } as unknown as Response);

describe("SessionAttendanceQuickActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it("returns null when no session id is provided", () => {
    const { container } = render(<SessionAttendanceQuickActions />);
    expect(container).toBeEmptyDOMElement();
  });

  it("disables the going button when the session is full", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockResponse({ status: null, counts: { ...DEFAULT_COUNTS, going: 3 }, maxAttendees: 3 })
    );

    render(<SessionAttendanceQuickActions sessionId="session-1" />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/sessions/session-1/attendance",
      expect.objectContaining({ cache: "no-store" })
    ));

    const fullButton = await screen.findByRole("button", { name: "Full" });
    expect(fullButton).toBeDisabled();
  });

  it("posts attendance updates and shows success toast", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockResponse({ status: null, counts: DEFAULT_COUNTS, maxAttendees: 5 })
      )
      .mockResolvedValueOnce(
        mockResponse({
          sessionId: "session-2",
          userId: "user-1",
          status: "going",
          previousStatus: null,
          counts: { ...DEFAULT_COUNTS, going: 1, total: 1 },
        })
      )
      .mockResolvedValueOnce(
        mockResponse({ status: "going", counts: { ...DEFAULT_COUNTS, going: 1, total: 1 }, maxAttendees: 5 })
      );

    const dispatchSpy = jest.spyOn(window, "dispatchEvent");

    render(<SessionAttendanceQuickActions sessionId="session-2" />);

    const goingButton = await screen.findByRole("button", { name: /I’m going/i });
    fireEvent.click(goingButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/sessions/session-2/attendance/join",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    expect(await screen.findByText("You’re going!")).toBeInTheDocument();
    expect(dispatchSpy).toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });
});
