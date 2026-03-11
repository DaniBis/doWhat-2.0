jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

import { GET } from "../route";

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

describe("attendance summary route", () => {
  const mockCreateServiceClient = createServiceClient as jest.MockedFunction<typeof createServiceClient>;
  const mockResolveApiUser = resolveApiUser as jest.MockedFunction<typeof resolveApiUser>;
  const mockGetSessionOrThrow = getSessionOrThrow as jest.MockedFunction<typeof getSessionOrThrow>;
  const mockGetUserAttendanceStatus = getUserAttendanceStatus as jest.MockedFunction<typeof getUserAttendanceStatus>;
  const mockGetAttendanceCounts = getAttendanceCounts as jest.MockedFunction<typeof getAttendanceCounts>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateServiceClient.mockReturnValue({} as never);
  });

  it("returns first-party attendance truth for session summaries", async () => {
    mockResolveApiUser.mockResolvedValueOnce({ id: "user-1" } as never);
    mockGetSessionOrThrow.mockResolvedValueOnce({ id: "session-1", max_attendees: 12 } as never);
    mockGetUserAttendanceStatus.mockResolvedValueOnce("going" as never);
    mockGetAttendanceCounts.mockResolvedValueOnce({ going: 2, interested: 1, declined: 0, total: 3, verified: 1 });

    const response = await GET(makeRequest(), makeContext("session-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessionId: "session-1",
      userId: "user-1",
      status: "going",
      counts: { going: 2, interested: 1, declined: 0, total: 3, verified: 1 },
      maxAttendees: 12,
      participation: {
        attendance_supported: true,
        attendance_source_kind: "session_attendance",
        first_party_attendance: true,
        rsvp_supported: true,
        verification_supported: true,
        participation_truth_level: "first_party",
        host_kind: "session_host",
        organizer_kind: "dowhat_host",
      },
    });
  });
});

function makeRequest(): Request {
  return { headers: { get: () => null } } as unknown as Request;
}

function makeContext(sessionId: string) {
  return { params: { sessionId } } as { params: { sessionId: string } };
}
