import type { AttendanceDisputeRow } from "@/types/database";

export type DisputeStatus = AttendanceDisputeRow["status"];

export type DisputeStatusToken = { label: string; className: string };

export const DISPUTE_STATUS_TOKENS: Record<DisputeStatus, DisputeStatusToken> = {
  open: { label: "Open", className: "border-amber-200 bg-amber-50 text-amber-800" },
  reviewing: { label: "In review", className: "border-blue-200 bg-blue-50 text-blue-800" },
  resolved: { label: "Resolved", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  dismissed: { label: "Dismissed", className: "border-gray-200 bg-gray-100 text-gray-700" },
};

export const DEFAULT_DISPUTE_STATUS_TOKEN: DisputeStatusToken = {
  label: "Open",
  className: "border-gray-200 bg-gray-100 text-gray-700",
};

export const DISPUTE_STATUS_OPTIONS: Array<{ value: DisputeStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "reviewing", label: "In review" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];
