"use client";

import { useCallback, useEffect, useState } from "react";

import type { AttendanceCounts } from "@/lib/sessions/server";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

type Status = "going" | "interested" | null;

type Props = {
  sessionId?: string | null;
  className?: string;
  size?: "default" | "compact";
};

type Toast = {
  type: "success" | "error";
  message: string;
};

type SummaryResponse = {
  status: Status;
  counts: AttendanceCounts;
  maxAttendees: number;
};

type MutationResponse = {
  sessionId: string;
  userId: string;
  status: Status;
  previousStatus: Status | null;
  counts: AttendanceCounts;
  error?: string;
};

const DEFAULT_COUNTS: AttendanceCounts = { going: 0, interested: 0, declined: 0, total: 0, verified: 0 };

export default function SessionAttendanceQuickActions({ sessionId, className, size = "default" }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [counts, setCounts] = useState<AttendanceCounts>(DEFAULT_COUNTS);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [maxAttendees, setMaxAttendees] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const response = await fetch(`/api/sessions/${sessionId}/attendance`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Unable to load attendance data.");
      }
      const data = (await response.json()) as Partial<SummaryResponse>;
      setStatus(data.status ?? null);
      setCounts(data.counts ?? DEFAULT_COUNTS);
      setMaxAttendees(data.maxAttendees ?? null);
    } catch (error) {
      console.warn("Failed to load attendance summary", error);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!sessionId || typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string }>).detail;
      if (detail?.sessionId === sessionId) {
        refresh();
      }
    };
    window.addEventListener("session-attendance-updated", handler as EventListener);
    return () => {
      window.removeEventListener("session-attendance-updated", handler as EventListener);
    };
  }, [refresh, sessionId]);

  if (!sessionId) {
    return null;
  }

  async function mutate(next: Status) {
    if (!next) return;
    setLoading(true);
    setToast(null);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/attendance/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = (await response.json()) as MutationResponse;
      if (!response.ok) {
        throw new Error(data.error || "Unable to update attendance.");
      }
      setStatus(data.status ?? null);
      setCounts(data.counts ?? DEFAULT_COUNTS);
      dispatchAttendanceEvent(data.userId, data.status ?? null);
      setToast({ type: "success", message: next === "going" ? "You’re going!" : "Marked interested." });
    } catch (error) {
      setToast({ type: "error", message: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  const isFull = maxAttendees != null && counts.going >= maxAttendees && status !== "going";
  const disableGoing = loading || status === "going" || isFull;
  const disableInterested = loading || status === "interested";

  function dispatchAttendanceEvent(userId: string, nextStatus: Status) {
    if (typeof window === "undefined") return;
    const detail = { sessionId, status: nextStatus, userId };
    window.dispatchEvent(new CustomEvent("session-attendance-updated", { detail }));
  }

  const baseButtonClasses =
    "rounded-full px-4 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2";
  const compactClasses = size === "compact" ? "px-3 py-1 text-xs" : "";

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => mutate("going")}
          disabled={disableGoing}
          className={`${baseButtonClasses} ${compactClasses} bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300`}
        >
          {status === "going" ? "You’re going" : isFull ? "Full" : "I’m going"}
        </button>
        <button
          type="button"
          onClick={() => mutate("interested")}
          disabled={disableInterested}
          className={`${baseButtonClasses} ${compactClasses} border border-emerald-200 text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {status === "interested" ? "Interested" : "I’m interested"}
        </button>
      </div>
      {toast && (
        <p className={`mt-2 text-sm ${toast.type === "success" ? "text-emerald-600" : "text-red-600"}`}>
          {toast.message}
        </p>
      )}
    </div>
  );
}
