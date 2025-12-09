"use client";

import { useState } from "react";

import type { AttendanceCounts } from "@/lib/sessions/server";
import { cn } from "@/lib/utils/cn";

const DEFAULT_COUNTS: AttendanceCounts = {
  going: 0,
  interested: 0,
  declined: 0,
  total: 0,
};

type Status = "going" | "interested" | null;

type Props = {
  sessionId: string;
  maxAttendees: number;
  initialStatus: Status;
  initialCounts?: AttendanceCounts | null;
  hostUserId: string;
  currentUserId?: string | null;
};

type ApiResponse = {
  sessionId: string;
  userId: string;
  status: Status;
  previousStatus: Status | null;
  counts: AttendanceCounts;
  error?: string;
};

type Toast = {
  type: "success" | "error";
  message: string;
};

export function SessionAttendancePanel({
  sessionId,
  maxAttendees,
  initialStatus,
  initialCounts,
  hostUserId,
  currentUserId,
}: Props) {
  const [status, setStatus] = useState<Status>(initialStatus ?? null);
  const [counts, setCounts] = useState<AttendanceCounts>(initialCounts ?? DEFAULT_COUNTS);
  const [toast, setToast] = useState<Toast | null>(null);
  const [loading, setLoading] = useState(false);

  const isHost = Boolean(currentUserId && currentUserId === hostUserId);
  const isFull = counts.going >= maxAttendees && status !== "going";

  const helperText = isFull
    ? "This session is full. You can still mark yourself as interested to get updates."
    : "Reserve your spot so others know who’s joining.";

  async function mutate(path: "join" | "leave", payload?: Record<string, unknown>) {
    setLoading(true);
    setToast(null);
    try {
      const body = payload ? JSON.stringify(payload) : undefined;
      const headers = payload ? { "Content-Type": "application/json" } : undefined;
      const response = await fetch(`/api/sessions/${sessionId}/attendance/${path}`, {
        method: "POST",
        headers,
        body,
      });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok) {
        throw new Error(data.error || "Unable to update attendance.");
      }
      setStatus(data.status ?? null);
      setCounts(data.counts ?? DEFAULT_COUNTS);
      dispatchAttendanceEvent(data.userId, data.status);
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setToast({ type: "error", message });
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function join(next: Exclude<Status, null>) {
    if (isHost) {
      setToast({ type: "error", message: "Hosts are already attending." });
      return;
    }
    if (next === "going" && isFull) {
      setToast({ type: "error", message: "This session is already full." });
      return;
    }
    try {
      await mutate("join", { status: next });
      setToast({ type: "success", message: next === "going" ? "You’re going!" : "Marked interested." });
    } catch {
      // error toast already handled in mutate
    }
  }

  async function leave() {
    try {
      await mutate("leave");
      setToast({ type: "success", message: "Removed from the list." });
    } catch {
      // handled in mutate
    }
  }

  function dispatchAttendanceEvent(userId: string, nextStatus: Status) {
    if (typeof window === "undefined") return;
    const detail = { sessionId, status: nextStatus, userId };
    window.dispatchEvent(new CustomEvent("session-attendance-updated", { detail }));
  }

  const disableGoing = loading || isHost || status === "going" || isFull;
  const disableInterested = loading || isHost || status === "interested";
  const showLeave = !isHost && Boolean(status);

  return (
    <section className="rounded-3xl border border-emerald-100 bg-white/70 p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Attendance</p>
          <p className="text-sm text-gray-600">{helperText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
          <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
            Going {counts.going}/{maxAttendees}
          </span>
          <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700">
            Interested {counts.interested}
          </span>
          {isHost && <span className="rounded-full bg-sky-50 px-3 py-1 font-semibold text-sky-700">You’re hosting</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(
              "rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition",
              "hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
              disableGoing && "cursor-not-allowed opacity-50",
            )}
            disabled={disableGoing}
            onClick={() => join("going")}
          >
            {status === "going" ? "You’re going" : "Join session"}
          </button>
          <button
            type="button"
            className={cn(
              "rounded-full border border-emerald-200 px-5 py-2 text-sm font-semibold text-emerald-600 transition",
              "hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
              disableInterested && "cursor-not-allowed opacity-60",
            )}
            disabled={disableInterested}
            onClick={() => join("interested")}
          >
            {status === "interested" ? "Interested" : "I’m interested"}
          </button>
          {showLeave && (
            <button
              type="button"
              className="rounded-full border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
              onClick={leave}
              disabled={loading}
            >
              Leave session
            </button>
          )}
        </div>
        {toast && (
          <p className={cn("text-sm", toast.type === "error" ? "text-red-600" : "text-emerald-600")}>{toast.message}</p>
        )}
      </div>
    </section>
  );
}
