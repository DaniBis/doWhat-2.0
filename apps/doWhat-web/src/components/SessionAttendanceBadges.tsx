"use client";

import { useCallback, useEffect, useState } from "react";

import type { AttendanceCounts } from "@/lib/sessions/server";

const DEFAULT_COUNTS: AttendanceCounts = { going: 0, interested: 0, declined: 0, total: 0, verified: 0 };

type Props = { sessionId?: string | null };

type SummaryResponse = {
  counts: AttendanceCounts;
};

export default function SessionAttendanceBadges({ sessionId }: Props) {
  const [counts, setCounts] = useState<AttendanceCounts | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const response = await fetch(`/api/sessions/${sessionId}/attendance`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as Partial<SummaryResponse>;
      setCounts(data.counts ?? DEFAULT_COUNTS);
    } catch {
      // Non-critical UI; ignore errors
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

  useEffect(() => {
    if (!sessionId || typeof window === "undefined") return;
    const timer = window.setInterval(() => refresh(), 30000);
    return () => window.clearInterval(timer);
  }, [refresh, sessionId]);

  if (!sessionId) return null;

  const going = counts?.going ?? "—";
  const interested = counts?.interested ?? "—";
  const verified = counts?.verified ?? "—";

  return (
    <div className="flex items-center gap-3 text-xs text-gray-700">
      <span className="rounded bg-gray-100 px-2 py-0.5">Going: {going}</span>
      <span className="rounded bg-gray-100 px-2 py-0.5">Interested: {interested}</span>
      <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-700">GPS verified: {verified}</span>
    </div>
  );
}
