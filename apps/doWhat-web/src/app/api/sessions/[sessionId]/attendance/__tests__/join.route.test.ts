jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

import { POST } from "../join/route";

jest.mock("@/lib/supabase/service", () => ({
  createServiceClient: jest.fn(),
}));

jest.mock("@/lib/sessions/server", () => {
  const actual = jest.requireActual("@/lib/sessions/server");
  return {
    ...actual,
    getAttendanceCounts: jest.fn(),
    getSessionOrThrow: jest.fn(),
    getUserAttendanceStatus: jest.fn(),
    resolveApiUser: jest.fn(),
  };
});

import { createServiceClient } from "@/lib/supabase/service";
import {
  getAttendanceCounts,
  getSessionOrThrow,
  getUserAttendanceStatus,
  resolveApiUser,
} from "@/lib/sessions/server";

describe("attendance join route", () => {
  const mockCreateServiceClient = createServiceClient as jest.MockedFunction<typeof createServiceClient>;
  const mockResolveApiUser = resolveApiUser as jest.MockedFunction<typeof resolveApiUser>;
  const mockGetSessionOrThrow = getSessionOrThrow as jest.MockedFunction<typeof getSessionOrThrow>;
  const mockGetUserAttendanceStatus = getUserAttendanceStatus as jest.MockedFunction<typeof getUserAttendanceStatus>;
  const mockGetAttendanceCounts = getAttendanceCounts as jest.MockedFunction<typeof getAttendanceCounts>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateServiceClient.mockReturnValue({
      from: () => ({
        upsert: jest.fn().mockResolvedValue({ error: null }),
      }),
    } as never);
  });

  it("returns 401 when the user is not signed in", async () => {
    mockResolveApiUser.mockResolvedValueOnce(null);

    const response = await POST(makeRequest({ status: "going" }), makeContext("session-unauth"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Please sign in." });
  });

  it("rejects going requests when the session is full", async () => {
    mockResolveApiUser.mockResolvedValueOnce({ id: "user-1" } as never);
    mockGetSessionOrThrow.mockResolvedValueOnce({ max_attendees: 2 } as never);
    mockGetUserAttendanceStatus.mockResolvedValueOnce("interested" as never);
    mockGetAttendanceCounts.mockResolvedValueOnce({ going: 2, interested: 0, declined: 0, total: 2, verified: 0 });

    const response = await POST(makeRequest({ status: "going" }), makeContext("session-full"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Session is full." });
  });

  it("upserts attendance status and returns the latest counts", async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    mockCreateServiceClient.mockReturnValueOnce({
      from: () => ({ upsert }),
    } as never);
    mockResolveApiUser.mockResolvedValueOnce({ id: "user-100" } as never);
    mockGetSessionOrThrow.mockResolvedValueOnce({ id: "session-100", max_attendees: 3 } as never);
    mockGetUserAttendanceStatus.mockResolvedValueOnce(null);
    mockGetAttendanceCounts
      .mockResolvedValueOnce({ going: 1, interested: 0, declined: 0, total: 1, verified: 0 })
      .mockResolvedValueOnce({ going: 2, interested: 0, declined: 0, total: 2, verified: 1 });

    const response = await POST(makeRequest({ status: "going" }), makeContext("session-100"));

    expect(upsert).toHaveBeenCalledWith(
      { session_id: "session-100", user_id: "user-100", status: "going" },
      { onConflict: "session_id,user_id" },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessionId: "session-100",
      userId: "user-100",
      status: "going",
      previousStatus: null,
      counts: { going: 2, interested: 0, declined: 0, total: 2, verified: 1 },
    });
    expect(mockGetAttendanceCounts).toHaveBeenCalledTimes(2);
  });
});

function makeRequest(body: Record<string, unknown>): Request {
  const mock = {
    json: async () => body,
    headers: { get: () => null },
  };
  return mock as unknown as Request;
}

function makeContext(sessionId: string) {
  return { params: { sessionId } } as { params: { sessionId: string } };
}
