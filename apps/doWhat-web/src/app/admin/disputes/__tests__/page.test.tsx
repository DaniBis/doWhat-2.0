import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import AdminDisputes from "../page";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

const mockGetUser = jest.fn();

jest.mock("@/lib/supabase/browser", () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
    },
  },
}));

describe("AdminDisputes", () => {
  const originalEnv = process.env.NEXT_PUBLIC_ADMIN_EMAILS;
  const fetchSpy = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = "ops@example.com";
    (global as unknown as { fetch: typeof fetch }).fetch = fetchSpy;
  });

  afterEach(() => {
    fetchSpy.mockReset();
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = originalEnv;
  });

  it("locks non-admin users out", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: "viewer@example.com" } } });

    render(<AdminDisputes />);

    const gateText = await screen.findByText((content) =>
      content.toLowerCase().includes("you don") && content.toLowerCase().includes("access"),
    );
    expect(gateText).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders disputes and updates status", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: "ops@example.com" } } });
    const row = {
      id: "dispute-1",
      sessionId: "session-1",
      reporterId: "user-1",
      status: "open",
      reason: "Incorrect no-show",
      details: "I was there",
      resolutionNotes: null,
      resolvedAt: null,
      createdAt: "2025-12-10T10:00:00.000Z",
      updatedAt: "2025-12-10T10:00:00.000Z",
      session: {
        id: "session-1",
        title: "Morning Run",
        venue: "River Park",
        startsAt: "2025-12-09T09:00:00.000Z",
        endsAt: "2025-12-09T11:00:00.000Z",
      },
      reporter: { id: "user-1", name: "Casey", avatarUrl: null },
    };

    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ disputes: [row] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          dispute: {
            ...row,
            status: "resolved",
            resolutionNotes: "Fixed",
            resolvedAt: "2025-12-11T12:00:00.000Z",
          },
        }),
      });

    render(<AdminDisputes />);

    expect(await screen.findByText(/Morning Run/i)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/api/admin/disputes"), expect.any(Object));

    const resolveButton = await screen.findByRole("button", { name: /^Resolve$/i });
    fireEvent.click(resolveButton);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const [, request] = fetchSpy.mock.calls[1];
      const body = JSON.parse((request as RequestInit).body as string);
      expect(body).toMatchObject({ id: "dispute-1", status: "resolved" });
    });

    expect(await screen.findByText(/Resolved/)).toBeInTheDocument();
  });
});
