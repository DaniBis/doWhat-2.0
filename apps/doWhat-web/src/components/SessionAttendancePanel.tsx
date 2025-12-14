"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ATTENDANCE_STATUSES,
  getAttendanceStatusLabel,
  trackVerifiedMatchesRecorded,
  RELIABILITY_BADGE_ORDER,
  RELIABILITY_BADGE_TOKENS,
} from "@dowhat/shared";
import type { AttendanceCounts } from "@/lib/sessions/server";
import { cn } from "@/lib/utils/cn";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";
import type { AttendanceStatus } from "@/types/database";

const DEFAULT_COUNTS: AttendanceCounts = {
  going: 0,
  interested: 0,
  declined: 0,
  total: 0,
  verified: 0,
};

type Status = "going" | "interested" | null;
type RosterStatus = "going" | "interested" | "declined";

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

type HostRosterRow = {
  userId: string;
  fullName: string | null;
  username: string | null;
  status: RosterStatus;
  attendanceStatus: AttendanceStatus;
  verified: boolean;
};

type HostRosterResponse = {
  sessionId: string;
  attendees: HostRosterRow[];
};

const ATTENDANCE_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = ATTENDANCE_STATUSES.map((status) => ({
  value: status,
  label: getAttendanceStatusLabel(status),
}));

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

  const [hostRoster, setHostRoster] = useState<HostRosterRow[]>([]);
  const [hostRosterLoading, setHostRosterLoading] = useState(false);
  const [hostRosterError, setHostRosterError] = useState<string | null>(null);
  const [hostDraftStatus, setHostDraftStatus] = useState<Record<string, AttendanceStatus>>({});
  const [hostDraftVerified, setHostDraftVerified] = useState<Record<string, boolean>>({});
  const [hostSubmitting, setHostSubmitting] = useState(false);
  const [hostToast, setHostToast] = useState<Toast | null>(null);

  const helperText = isFull
    ? "This session is full. You can still mark yourself as interested to get updates."
    : "Reserve your spot so others know who’s joining.";

  const verifiedCount = counts.verified ?? 0;

  const summaryBadges = (
    <div className="flex flex-wrap items-center gap-sm text-sm font-semibold">
      {RELIABILITY_BADGE_ORDER.map((key) => {
        const token = RELIABILITY_BADGE_TOKENS[key];
        const value =
          key === "going"
            ? `${counts.going}/${maxAttendees}`
            : key === "interested"
              ? counts.interested
              : verifiedCount;
        return (
          <span
            key={key}
            className="inline-flex items-center gap-xxs rounded-full border px-sm py-xxs"
            style={{ backgroundColor: token.backgroundColor, borderColor: token.borderColor, color: token.textColor }}
          >
            {token.icon && (
              <span aria-hidden="true" className="text-sm">
                {token.icon}
              </span>
            )}
            {token.label} {value}
          </span>
        );
      })}
      {isHost && <span className="rounded-full bg-sky-50 px-sm py-xxs text-sky-700 font-semibold">You’re hosting</span>}
    </div>
  );

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const response = await fetch(`/api/sessions/${sessionId}/attendance`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { counts?: AttendanceCounts; status?: Status };
      if (data.counts) {
        setCounts(data.counts);
      }
      if (!isHost && typeof data.status !== "undefined") {
        setStatus(data.status ?? null);
      }
    } catch {
      // best-effort refresh
    }
  }, [isHost, sessionId]);

  const loadHostRoster = useCallback(async () => {
    if (!isHost || !sessionId) return null;
    setHostRosterLoading(true);
    setHostRosterError(null);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/attendance/host`, { cache: "no-store" });
      const json = (await response.json()) as HostRosterResponse | { error?: string };
      if (!response.ok) {
        throw new Error((json as { error?: string }).error || "Unable to load roster.");
      }
      const cast = json as HostRosterResponse;
      const attendees = Array.isArray(cast.attendees) ? cast.attendees : [];
      setHostRoster(attendees);
      setHostDraftStatus({});
      setHostDraftVerified({});
      return attendees;
    } catch (error) {
      setHostRosterError(getErrorMessage(error));
      return null;
    } finally {
      setHostRosterLoading(false);
    }
  }, [isHost, sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (isHost) {
      loadHostRoster();
    }
  }, [isHost, loadHostRoster]);

  const hostPendingChanges = useMemo(() => {
    if (!isHost) return [] as Array<{ userId: string; attendanceStatus: AttendanceStatus; verified: boolean }>;
    return hostRoster
      .map((row) => {
        const nextStatus = hostDraftStatus[row.userId] ?? row.attendanceStatus;
        const nextVerified = hostDraftVerified[row.userId] ?? row.verified;
        const changed = nextStatus !== row.attendanceStatus || nextVerified !== row.verified;
        return changed
          ? {
              userId: row.userId,
              attendanceStatus: nextStatus,
              verified: nextVerified,
            }
          : null;
      })
      .filter((row): row is { userId: string; attendanceStatus: AttendanceStatus; verified: boolean } => Boolean(row));
  }, [hostDraftStatus, hostDraftVerified, hostRoster, isHost]);

  const handleHostStatusChange = useCallback((userId: string, nextStatus: AttendanceStatus) => {
    setHostDraftStatus((prev) => {
      const baseStatus = hostRoster.find((row) => row.userId === userId)?.attendanceStatus;
      const next = { ...prev };
      if (nextStatus === baseStatus || !nextStatus) {
        delete next[userId];
      } else {
        next[userId] = nextStatus;
      }
      return next;
    });
    if (nextStatus !== "attended") {
      setHostDraftVerified((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
  }, [hostRoster]);

  const handleHostVerifiedToggle = useCallback((userId: string, verified: boolean) => {
    setHostDraftVerified((prev) => {
      const base = hostRoster.find((row) => row.userId === userId)?.verified ?? false;
      const next = { ...prev };
      if (verified === base) {
        delete next[userId];
      } else {
        next[userId] = verified;
      }
      return next;
    });
  }, [hostRoster]);

  const handleHostSave = useCallback(async () => {
    if (!sessionId) return;
    if (!hostPendingChanges.length) {
      setHostToast({ type: "error", message: "No changes to record." });
      return;
    }
    setHostSubmitting(true);
    setHostToast(null);
    const previousRoster = hostRoster;
    try {
      const response = await fetch(`/api/sessions/${sessionId}/attendance/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: hostPendingChanges }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error || "Unable to record attendance.");
      }
      const [updatedRoster] = await Promise.all([loadHostRoster(), refresh()]);
      const rosterLookup = new Map(previousRoster.map((row) => [row.userId, row.verified]));
      const verifiedMarked = hostPendingChanges.filter((change) => change.verified && !rosterLookup.get(change.userId)).length;
      const verifiedCleared = hostPendingChanges.filter((change) => !change.verified && rosterLookup.get(change.userId)).length;
      const verifiedTotal = Array.isArray(updatedRoster)
        ? updatedRoster.filter((row) => row.verified).length
        : undefined;
      trackVerifiedMatchesRecorded({
        sessionId,
        hostUserId,
        platform: "web",
        totalUpdates: hostPendingChanges.length,
        verifiedMarked,
        verifiedCleared,
        verifiedTotal,
      });
      setHostToast({ type: "success", message: "Attendance recorded." });
    } catch (error) {
      setHostToast({ type: "error", message: getErrorMessage(error) });
    } finally {
      setHostSubmitting(false);
    }
  }, [hostPendingChanges, hostRoster, hostUserId, loadHostRoster, refresh, sessionId]);

  function dispatchAttendanceEvent(userId: string, nextStatus: Status) {
    if (typeof window === "undefined") return;
    const detail = { sessionId, status: nextStatus, userId };
    window.dispatchEvent(new CustomEvent("session-attendance-updated", { detail }));
  }

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
      // handled via mutate
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

  const disableGoing = loading || isHost || status === "going" || isFull;
  const disableInterested = loading || isHost || status === "interested";
  const showLeave = !isHost && Boolean(status);

  if (isHost) {
    return (
      <section className="rounded-3xl border border-brand-teal/20 bg-surface/80 p-xl shadow-sm">
        <div className="flex flex-col gap-md">
          <div>
            <p className="text-sm font-semibold text-brand-dark">Attendance log</p>
            <p className="text-sm text-ink-medium">Record who actually showed up so reliability stays accurate.</p>
          </div>
          {summaryBadges}
          <div className="space-y-sm">
            {hostRosterLoading && <p className="text-sm text-ink-muted">Loading roster…</p>}
            {hostRosterError && <p className="text-sm text-feedback-danger">{hostRosterError}</p>}
            {!hostRosterLoading && !hostRosterError && hostRoster.length === 0 && (
              <p className="rounded-2xl border border-dashed px-md py-sm text-sm text-ink-muted">
                No attendees to review yet.
              </p>
            )}
            {!hostRosterLoading && !hostRosterError && hostRoster.length > 0 && (
              <ul className="flex flex-col gap-sm">
                {hostRoster.map((row) => {
                  const hasDraftStatus = Object.prototype.hasOwnProperty.call(hostDraftStatus, row.userId);
                  const hasDraftVerified = Object.prototype.hasOwnProperty.call(hostDraftVerified, row.userId);
                  const currentStatus = hasDraftStatus ? hostDraftStatus[row.userId]! : row.attendanceStatus;
                  const currentVerified = hasDraftVerified ? Boolean(hostDraftVerified[row.userId]) : row.verified;
                  const verifiedDisabled = currentStatus !== "attended";
                  return (
                    <li
                      key={row.userId}
                      className="rounded-2xl border border-midnight-border/30 bg-surface px-md py-sm shadow-sm"
                    >
                      <div className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{row.fullName || row.username || "Member"}</p>
                          <p className="text-xs text-ink-muted">{formatRsvpStatus(row.status)}</p>
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          {formatAttendanceStatus(currentStatus)}
                        </span>
                      </div>
                      <div className="mt-sm flex flex-col gap-sm sm:flex-row sm:items-center">
                        <label className="text-xs font-semibold text-ink-medium">Final status</label>
                        <select
                          className="flex-1 rounded-xl border border-midnight-border/40 bg-surface px-sm py-xs text-sm"
                          value={currentStatus}
                          onChange={(event) => handleHostStatusChange(row.userId, event.target.value as AttendanceStatus)}
                        >
                          {ATTENDANCE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <label
                          className={cn(
                            "inline-flex items-center gap-xs text-xs font-semibold",
                            verifiedDisabled ? "text-ink-muted" : "text-brand-teal",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-midnight-border/60 text-brand-teal focus:ring-brand-teal"
                            checked={currentVerified && !verifiedDisabled}
                            disabled={verifiedDisabled}
                            onChange={(event) => handleHostVerifiedToggle(row.userId, event.target.checked)}
                          />
                          Verified via GPS
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-xs sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-medium">
              {hostPendingChanges.length ? `${hostPendingChanges.length} pending change(s)` : "No pending changes"}
            </p>
            <button
              type="button"
              className={cn(
                "rounded-full bg-brand-teal px-lg py-xs text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark",
                hostPendingChanges.length === 0 && "cursor-not-allowed opacity-50",
              )}
              disabled={hostPendingChanges.length === 0 || hostSubmitting}
              onClick={handleHostSave}
            >
              {hostSubmitting ? "Saving…" : "Record attendance"}
            </button>
          </div>
          {hostToast && (
            <p className={cn("text-sm", hostToast.type === "error" ? "text-feedback-danger" : "text-feedback-success")}>
              {hostToast.message}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-brand-teal/20 bg-surface/70 p-xl shadow-sm">
      <div className="flex flex-col gap-xs">
        <div>
          <p className="text-sm font-semibold text-brand-dark">Attendance</p>
          <p className="text-sm text-ink-medium">{helperText}</p>
        </div>
        {summaryBadges}
        <div className="flex flex-wrap gap-xs">
          <button
            type="button"
            className={cn(
              "rounded-full bg-brand-teal px-lg py-xs text-sm font-semibold text-white shadow-sm transition",
              "hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2",
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
              "rounded-full border border-brand-teal/30 px-lg py-xs text-sm font-semibold text-brand-teal transition",
              "hover:bg-brand-teal/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2",
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
              className="rounded-full border border-midnight-border/40 px-lg py-xs text-sm font-semibold text-ink-medium transition hover:bg-surface-alt"
              onClick={leave}
              disabled={loading}
            >
              Leave session
            </button>
          )}
        </div>
        {toast && (
          <p className={cn("text-sm", toast.type === "error" ? "text-feedback-danger" : "text-feedback-success")}>{toast.message}</p>
        )}
      </div>
    </section>
  );
}

function formatAttendanceStatus(status: AttendanceStatus): string {
  return getAttendanceStatusLabel(status);
}

function formatRsvpStatus(status: RosterStatus): string {
  if (status === "going") return "Marked going";
  if (status === "interested") return "Marked interested";
  return "Declined";
}
