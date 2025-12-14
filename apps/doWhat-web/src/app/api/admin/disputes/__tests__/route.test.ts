jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/supabase/service", () => ({
  createServiceClient: jest.fn(),
}));

import { GET, PATCH } from "../route";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockCreateServiceClient = createServiceClient as jest.MockedFunction<typeof createServiceClient>;
const ADMIN_EMAIL = "ops@example.com";

describe("/api/admin/disputes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = ADMIN_EMAIL;
  });

  describe("GET", () => {
    it("rejects users outside the allow list", async () => {
      mockAdminAuth("viewer@example.com");

      const response = await GET(createGetRequest("http://app.local/api/admin/disputes"));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "You are not authorized to manage disputes." });
      expect(mockCreateServiceClient).not.toHaveBeenCalled();
    });

    it("returns mapped disputes with the clamped limit", async () => {
      mockAdminAuth();
      const rows = [
        {
          id: "dispute-1",
          session_id: "session-1",
          reporter_id: "user-1",
          status: "reviewing",
          reason: "Incorrect no-show",
          details: "I was there",
          resolution_notes: null,
          resolved_at: null,
          created_at: "2025-12-10T10:00:00.000Z",
          updated_at: "2025-12-10T10:05:00.000Z",
          reporter: { id: "user-1", full_name: "Taylor", avatar_url: "avatar.png" },
          sessions: {
            id: "session-1",
            starts_at: "2025-12-09T09:00:00.000Z",
            ends_at: "2025-12-09T11:00:00.000Z",
            activities: { name: "Morning Run" },
            venues: { name: "River Park" },
          },
        },
      ];
      const statusCounts = { open: 5, reviewing: 1, resolved: 7, dismissed: 0 };
      const listBuilder = createListBuilder(rows);
      mockCreateServiceClient.mockReturnValue({
        from: jest.fn((table: string) => {
          if (table !== "attendance_disputes") {
            throw new Error(`Unexpected table ${table}`);
          }
          return {
            select: jest.fn((_: string, options?: Record<string, unknown>) => {
              if (options?.head === true) {
                return createStatusCountBuilder(statusCounts);
              }
              return listBuilder;
            }),
          };
        }),
      } as never);

      const response = await GET(createGetRequest("http://app.local/api/admin/disputes?status=reviewing&limit=500"));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        disputes: [
          {
            id: "dispute-1",
            sessionId: "session-1",
            reporterId: "user-1",
            status: "reviewing",
            reason: "Incorrect no-show",
            details: "I was there",
            resolutionNotes: null,
            resolvedAt: null,
            createdAt: "2025-12-10T10:00:00.000Z",
            updatedAt: "2025-12-10T10:05:00.000Z",
            session: {
              id: "session-1",
              title: "Morning Run",
              venue: "River Park",
              startsAt: "2025-12-09T09:00:00.000Z",
              endsAt: "2025-12-09T11:00:00.000Z",
            },
            reporter: {
              id: "user-1",
              name: "Taylor",
              avatarUrl: "avatar.png",
            },
          },
        ],
        limit: 200,
        total: 1,
        statusCounts: statusCounts,
        statuses: ["open", "reviewing", "resolved", "dismissed"],
      });
      expect(listBuilder.limit).toHaveBeenCalledWith(200);
      expect(listBuilder.eq).toHaveBeenCalledWith("status", "reviewing");
    });
  });

  describe("PATCH", () => {
    it("validates required fields", async () => {
      mockAdminAuth();

      const response = await PATCH(createPatchRequest({ status: "resolved" }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "id is required." });
      expect(mockCreateServiceClient).not.toHaveBeenCalled();
    });

    it("updates disputes, logs the audit event, and returns the refreshed row", async () => {
      mockAdminAuth();
      const updateEqMock = jest.fn().mockResolvedValue({ error: null });
      const updateMock = jest.fn(() => ({ eq: updateEqMock }));
      const refreshedRow = {
        id: "dispute-77",
        session_id: "session-99",
        reporter_id: "user-55",
        status: "resolved",
        reason: "Auto no-show",
        details: null,
        resolution_notes: "Confirmed attendance",
        resolved_at: "2025-12-14T12:00:00.000Z",
        created_at: "2025-12-13T09:00:00.000Z",
        updated_at: "2025-12-14T12:00:00.000Z",
        reporter: { id: "user-55", full_name: "Morgan", avatar_url: null },
        sessions: {
          id: "session-99",
          starts_at: "2025-12-12T18:00:00.000Z",
          ends_at: "2025-12-12T20:00:00.000Z",
          activities: { name: "Evening Swim" },
          venues: { name: "Community Pool" },
        },
      };
      const singleBuilder = createSingleBuilder(refreshedRow);
      const attendanceTable = {
        update: updateMock,
        select: jest.fn(() => singleBuilder),
      };
      const auditInsert = jest.fn().mockResolvedValue({ error: null });
      const serviceStub = {
        from: jest.fn((table: string) => {
          if (table === "attendance_disputes") return attendanceTable;
          if (table === "admin_audit_logs") return { insert: auditInsert };
          throw new Error(`Unexpected table ${table}`);
        }),
      };
      mockCreateServiceClient.mockReturnValue(serviceStub as never);

      const response = await PATCH(
        createPatchRequest({ id: "dispute-77", status: "resolved", resolutionNotes: "Confirmed attendance" }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        dispute: {
          id: "dispute-77",
          sessionId: "session-99",
          reporterId: "user-55",
          status: "resolved",
          reason: "Auto no-show",
          details: null,
          resolutionNotes: "Confirmed attendance",
          resolvedAt: "2025-12-14T12:00:00.000Z",
          createdAt: "2025-12-13T09:00:00.000Z",
          updatedAt: "2025-12-14T12:00:00.000Z",
          session: {
            id: "session-99",
            title: "Evening Swim",
            venue: "Community Pool",
            startsAt: "2025-12-12T18:00:00.000Z",
            endsAt: "2025-12-12T20:00:00.000Z",
          },
          reporter: {
            id: "user-55",
            name: "Morgan",
            avatarUrl: null,
          },
        },
      });
      expect(updateMock).toHaveBeenCalledWith({
        updated_at: expect.any(String),
        status: "resolved",
        resolved_at: expect.any(String),
        resolution_notes: "Confirmed attendance",
      });
      expect(updateEqMock).toHaveBeenCalledWith("id", "dispute-77");
      expect(auditInsert).toHaveBeenCalledWith({
        actor_email: ADMIN_EMAIL,
        action: "update_dispute",
        entity_type: "attendance_disputes",
        entity_id: "dispute-77",
        details: { status: "resolved", hasResolutionNotes: true },
      });
      expect(singleBuilder.eq).toHaveBeenCalledWith("id", "dispute-77");
    });
  });
});

function mockAdminAuth(email = ADMIN_EMAIL) {
  mockCreateClient.mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: "admin-1", email } },
        error: null,
      }),
    },
  } as never);
}

function createGetRequest(url: string): Request {
  return { url } as unknown as Request;
}

function createPatchRequest(body: Record<string, unknown>): Request {
  return {
    url: "http://app.local/api/admin/disputes",
    json: async () => body,
  } as unknown as Request;
}

function createListBuilder(rows: unknown[]) {
  const response = Promise.resolve({ data: rows, error: null, count: rows.length });
  const builder: any = {};
  builder.order = jest.fn(() => builder);
  builder.limit = jest.fn(() => builder);
  builder.eq = jest.fn(() => builder);
  builder.select = jest.fn(() => builder);
  builder.then = response.then.bind(response);
  builder.catch = response.catch.bind(response);
  return builder;
}

function createSingleBuilder(row: unknown) {
  const builder: any = {};
  builder.eq = jest.fn(() => builder);
  builder.maybeSingle = jest.fn(async () => ({ data: row, error: null }));
  return builder;
}

function createStatusCountBuilder(counts: Record<string, number>) {
  const builder: any = {};
  builder.eq = jest.fn((_, status: string) => {
    const response = Promise.resolve({ data: null, error: null, count: counts[status] ?? 0 });
    builder.then = response.then.bind(response);
    builder.catch = response.catch.bind(response);
    return builder;
  });
  return builder;
}
