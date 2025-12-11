jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

import { POST } from "../leave/route";

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

describe("attendance leave route", () => {
  const mockCreateServiceClient = createServiceClient as jest.MockedFunction<typeof createServiceClient>;
  const mockResolveApiUser = resolveApiUser as jest.MockedFunction<typeof resolveApiUser>;
  const mockGetSessionOrThrow = getSessionOrThrow as jest.MockedFunction<typeof getSessionOrThrow>;
  const mockGetUserAttendanceStatus = getUserAttendanceStatus as jest.MockedFunction<typeof getUserAttendanceStatus>;
  const mockGetAttendanceCounts = getAttendanceCounts as jest.MockedFunction<typeof getAttendanceCounts>;

  beforeEach(() => {
    jest.clearAllMocks();
    const stub = createMockService();
    mockCreateServiceClient.mockReturnValue(stub.service as never);
  });

  it("returns 401 when the user is not signed in", async () => {
    mockResolveApiUser.mockResolvedValueOnce(null);

    const response = await POST(makeRequest(), makeContext("session-leave"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Please sign in." });
  });

  it("deletes the attendee row and returns the updated counts", async () => {
    const stub = createMockService();
    mockCreateServiceClient.mockReturnValueOnce(stub.service as never);
    mockResolveApiUser.mockResolvedValueOnce({ id: "user-5" } as never);
    mockGetSessionOrThrow.mockResolvedValueOnce({ id: "session-5" } as never);
    mockGetUserAttendanceStatus.mockResolvedValueOnce("going" as never);
    mockGetAttendanceCounts.mockResolvedValueOnce({ going: 1, interested: 0, declined: 0, total: 1, verified: 0 });

    const response = await POST(makeRequest(), makeContext("session-5"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessionId: "session-5",
      userId: "user-5",
      status: null,
      previousStatus: "going",
      counts: { going: 1, interested: 0, declined: 0, total: 1, verified: 0 },
    });
    expect(stub.eqMock).toHaveBeenNthCalledWith(1, "session_id", "session-5");
    expect(stub.eqMock).toHaveBeenNthCalledWith(2, "user_id", "user-5");
  });
});

function makeRequest(): Request {
  const mock = {
    json: async () => null,
    headers: { get: () => null },
  };
  return mock as unknown as Request;
}

function makeContext(sessionId: string) {
  return { params: { sessionId } } as { params: { sessionId: string } };
}

function createMockService() {
  const deleteQuery = createDeleteQuery();
  const eqMock = deleteQuery.eq;
  const deleteMock = jest.fn(() => deleteQuery);
  const fromMock = jest.fn(() => ({ delete: deleteMock }));
  const service = { from: fromMock } as unknown as ReturnType<typeof createServiceClient>;
  return { service, eqMock };
}

function createDeleteQuery() {
  const query: { eq: jest.Mock; then: (onFulfilled: (value: { error: null }) => unknown) => Promise<unknown> } = {
    eq: jest.fn(),
    then: (onFulfilled) => Promise.resolve(onFulfilled({ error: null })),
  };
  query.eq.mockReturnValue(query);
  return query;
}
