import type { AttendanceStatus } from "@/types/database";
/** Only passed-through verified flags when the attendee was marked as attended. */
export function normalizeVerifiedFlag(status: AttendanceStatus, verified?: boolean): boolean {
  if (status !== "attended") return false;
  return Boolean(verified);
}

export type ReliabilityUpdateInput = {
  userId: string;
  attendanceStatus: AttendanceStatus;
  verified?: boolean;
};
