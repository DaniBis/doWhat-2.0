import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SessionAttendancePanel } from "../SessionAttendancePanel";

describe("SessionAttendancePanel", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.clearAllMocks();
    global.fetch = originalFetch;
  });

  it("lets hosts update roster statuses and GPS verification", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/attendance") && (!init || init.method === undefined)) {
        return makeResponse({ counts: { going: 1, interested: 0, declined: 0, total: 1, verified: 0 } });
      }
      if (url.endsWith("/attendance/host") && (!init || init.method === undefined)) {
        return makeResponse({
          sessionId: "session-host",
          attendees: [
            {
              userId: "user-1",
              fullName: "Taylor",
              username: "tay",
              status: "going",
              attendanceStatus: "registered",
              verified: false,
            },
          ],
        });
      }
      if (url.endsWith("/attendance/host") && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        const payload = JSON.parse(init.body as string);
        expect(payload).toEqual({
          updates: [
            { userId: "user-1", attendanceStatus: "attended", verified: true },
          ],
        });
        return makeResponse({ sessionId: "session-host", applied: 1 });
      }
      throw new Error(`Unhandled fetch call for ${url}`);
    }) as jest.Mock;
    global.fetch = fetchMock;

    render(
      <SessionAttendancePanel
        sessionId="session-host"
        maxAttendees={8}
        initialStatus="going"
        initialCounts={{ going: 1, interested: 0, declined: 0, total: 1, verified: 0 }}
        hostUserId="host-1"
        currentUserId="host-1"
      />,
    );

    expect(await screen.findByText("Attendance log")).toBeInTheDocument();
    expect(await screen.findByText("Taylor")).toBeInTheDocument();

    const statusSelect = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(statusSelect, { target: { value: "attended" } });

    const verifiedCheckbox = screen.getByLabelText("Verified via GPS") as HTMLInputElement;
    fireEvent.click(verifiedCheckbox);

    const saveButton = screen.getByRole("button", { name: "Record attendance" });
    fireEvent.click(saveButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/attendance/host"), expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(screen.getByText("Attendance recorded.")).toBeInTheDocument());
  });
});

function makeResponse<T>(data: T, ok = true): Response {
  return {
    ok,
    json: async () => data,
  } as Response;
}
