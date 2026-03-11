jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock("@/lib/supabase/service", () => ({
  createServiceClient: jest.fn(),
}));

jest.mock("@/lib/sessions/server", () => {
  const actual = jest.requireActual("@/lib/sessions/server");
  return {
    ...actual,
    getSessionOrThrow: jest.fn(),
    resolveApiUser: jest.fn(),
  };
});

jest.mock("@/lib/sessions/attendanceReliability", () => ({
  normalizeVerifiedFlag: jest.fn((status: string, verified?: boolean) => Boolean(status === "attended" && verified)),
}));

import { GET, POST } from "../host/route";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionOrThrow, resolveApiUser } from "@/lib/sessions/server";
import { normalizeVerifiedFlag } from "@/lib/sessions/attendanceReliability";

type RouteContext = { params: { sessionId: string } };

describe("attendance host route", () => {
  const mockCreateServiceClient = createServiceClient as jest.MockedFunction<typeof createServiceClient>;
  const mockResolveApiUser = resolveApiUser as jest.MockedFunction<typeof resolveApiUser>;
  const mockGetSessionOrThrow = getSessionOrThrow as jest.MockedFunction<typeof getSessionOrThrow>;
  const mockNormalizeVerifiedFlag = normalizeVerifiedFlag as jest.MockedFunction<typeof normalizeVerifiedFlag>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeVerifiedFlag.mockImplementation((status, verified) => (status === "attended" ? Boolean(verified) : false));
  });

  describe("GET", () => {
    it("requires authentication", async () => {
      mockResolveApiUser.mockResolvedValueOnce(null);

      const response = await GET(createRequest(), createContext("session-no-auth"));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Please sign in." });
    });

    it("returns the host roster", async () => {
      mockResolveApiUser.mockResolvedValueOnce({ id: "host-1" } as never);
      mockGetSessionOrThrow.mockResolvedValueOnce({ host_user_id: "host-1" } as never);
      const rosterRows = [
        {
          user_id: "user-1",
          status: "going",
          attendance_status: "attended",
          checked_in: true,
          profiles: { full_name: "Taylor", username: "tay" },
        },
      ];
      mockCreateServiceClient.mockReturnValueOnce(
        createRosterServiceStub({ data: rosterRows, error: null }) as unknown as ReturnType<typeof createServiceClient>,
      );

      const response = await GET(createRequest(), createContext("session-1"));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        sessionId: "session-1",
        attendees: [
          {
            userId: "user-1",
            status: "going",
            attendanceStatus: "attended",
            verified: true,
            fullName: "Taylor",
            username: "tay",
          },
        ],
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

    it("maps late-cancel attendance to declined roster status", async () => {
      mockResolveApiUser.mockResolvedValueOnce({ id: "host-1" } as never);
      mockGetSessionOrThrow.mockResolvedValueOnce({ host_user_id: "host-1" } as never);
      const rosterRows = [
        {
          user_id: "user-2",
          status: "going",
          attendance_status: "late_cancel",
          checked_in: false,
          profiles: { full_name: "Jordan", username: "jord" },
        },
      ];
      mockCreateServiceClient.mockReturnValueOnce(
        createRosterServiceStub({ data: rosterRows, error: null }) as unknown as ReturnType<typeof createServiceClient>,
      );

      const response = await GET(createRequest(), createContext("session-2"));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        sessionId: "session-2",
        attendees: [
          {
            userId: "user-2",
            status: "declined",
            attendanceStatus: "late_cancel",
            verified: false,
            fullName: "Jordan",
            username: "jord",
          },
        ],
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

  describe("POST", () => {
    it("rejects non-host users", async () => {
      mockResolveApiUser.mockResolvedValueOnce({ id: "user-2" } as never);
      mockGetSessionOrThrow.mockResolvedValueOnce({ host_user_id: "host-1" } as never);

      const response = await POST(
        createRequest({ updates: [{ userId: "user-5", attendanceStatus: "attended", verified: true }] }),
        createContext("session-guard"),
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "Only the host can record attendance." });
    });

    it("applies updates and normalizes verified flags", async () => {
      mockResolveApiUser.mockResolvedValueOnce({ id: "host-1" } as never);
      mockGetSessionOrThrow.mockResolvedValueOnce({ host_user_id: "host-1" } as never);
      const updateStub = createUpdateServiceStub();
      mockCreateServiceClient.mockReturnValueOnce(updateStub.service as unknown as ReturnType<typeof createServiceClient>);

      const response = await POST(
        createRequest({
          updates: [
            { userId: "user-77", attendanceStatus: "attended", verified: true },
            { userId: "user-88", attendanceStatus: "late_cancel", verified: true },
            { userId: "user-99", attendanceStatus: "no_show", verified: true },
          ],
        }),
        createContext("session-apply"),
      );

      expect(mockNormalizeVerifiedFlag).toHaveBeenNthCalledWith(1, "attended", true);
      expect(mockNormalizeVerifiedFlag).toHaveBeenNthCalledWith(2, "late_cancel", true);
      expect(mockNormalizeVerifiedFlag).toHaveBeenNthCalledWith(3, "no_show", true);
      expect(updateStub.updateMock).toHaveBeenCalledTimes(3);
      expect(updateStub.updateMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          attendance_status: "attended",
          checked_in: true,
          status: "going",
        }),
      );
      expect(updateStub.updateMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          attendance_status: "late_cancel",
          checked_in: false,
        }),
      );
      expect(updateStub.updateMock.mock.calls[1]?.[0]).not.toHaveProperty("status");
      expect(updateStub.updateMock).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          attendance_status: "no_show",
          checked_in: false,
        }),
      );
      expect(updateStub.updateMock.mock.calls[2]?.[0]).not.toHaveProperty("status");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        sessionId: "session-apply",
        applied: 3,
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

    it("restores RSVP going when moving from late_cancel back to registered", async () => {
      mockResolveApiUser.mockResolvedValueOnce({ id: "host-1" } as never);
      mockGetSessionOrThrow.mockResolvedValueOnce({ host_user_id: "host-1" } as never);
      const updateStub = createUpdateServiceStub({
        "user-99": { status: "declined", attendance_status: "late_cancel" },
      });
      mockCreateServiceClient.mockReturnValueOnce(updateStub.service as unknown as ReturnType<typeof createServiceClient>);

      const response = await POST(
        createRequest({
          updates: [{ userId: "user-99", attendanceStatus: "registered", verified: true }],
        }),
        createContext("session-registered"),
      );

      expect(updateStub.updateMock).toHaveBeenCalledTimes(1);
      expect(updateStub.updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attendance_status: "registered",
          checked_in: false,
          attended_at: null,
          status: "going",
        }),
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        sessionId: "session-registered",
        applied: 1,
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
});

function createRequest(body?: Record<string, unknown>): Request {
  const mock = {
    json: async () => body ?? {},
    headers: { get: () => null },
  };
  return mock as unknown as Request;
}

function createContext(sessionId: string): RouteContext {
  return { params: { sessionId } };
}

function createRosterServiceStub(result: { data: unknown; error: unknown }) {
  const order = jest.fn(async () => result);
  const eq = jest.fn(() => ({ order }));
  const select = jest.fn(() => ({ eq, order }));
  const from = jest.fn(() => ({ select }));
  return { from };
}

function createUpdateServiceStub(
  existingByUser: Record<string, { status: "going" | "interested" | "declined"; attendance_status: "registered" | "attended" | "late_cancel" | "no_show" }> = {},
) {
  const pendingUserRef: { current: string | null } = { current: null };

  const maybeSingle = jest.fn(async () => {
    const userId = pendingUserRef.current;
    const existing = (userId && existingByUser[userId]) || { status: "going", attendance_status: "registered" };
    return { data: existing, error: null };
  });
  const eqUserForRead = jest.fn((column: string, value?: string) => {
    if (column === "user_id") pendingUserRef.current = value ?? null;
    return { maybeSingle };
  });
  const eqSessionForRead = jest.fn(() => ({ eq: eqUserForRead }));
  const selectForRead = jest.fn(() => ({ eq: eqSessionForRead }));

  const selectForUpdate = jest.fn(async () => ({ data: [{ user_id: pendingUserRef.current ?? "user-77" }], error: null }));
  const eqUserForUpdate = jest.fn((column: string, value?: string) => {
    if (column === "user_id") pendingUserRef.current = value ?? null;
    return { select: selectForUpdate };
  });
  const eqSessionForUpdate = jest.fn(() => ({ eq: eqUserForUpdate }));
  const updateMock = jest.fn((_payload: Record<string, unknown>) => ({ eq: eqSessionForUpdate }));

  const from = jest.fn(() => ({ select: selectForRead, update: updateMock }));
  return { service: { from }, updateMock };
}
