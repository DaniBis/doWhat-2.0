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
          ],
        }),
        createContext("session-apply"),
      );

      expect(mockNormalizeVerifiedFlag).toHaveBeenNthCalledWith(1, "attended", true);
      expect(mockNormalizeVerifiedFlag).toHaveBeenNthCalledWith(2, "late_cancel", true);
      expect(updateStub.updateMock).toHaveBeenCalledTimes(2);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ sessionId: "session-apply", applied: 2 });
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

function createUpdateServiceStub() {
  const select = jest.fn(async () => ({ data: [{ user_id: "user-77" }], error: null }));
  const eqUser = jest.fn(() => ({ select }));
  const eqSession = jest.fn(() => ({ eq: eqUser }));
  const updateMock = jest.fn(() => ({ eq: eqSession }));
  const from = jest.fn(() => ({ update: updateMock }));
  return { service: { from }, updateMock };
}
