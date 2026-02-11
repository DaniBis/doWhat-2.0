"use client";

import { useCallback, useEffect, useState } from "react";

import { RELIABILITY_BADGE_ORDER, RELIABILITY_BADGE_TOKENS, type ReliabilityBadgeKey } from "@dowhat/shared";

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

  const badgeValues: Record<ReliabilityBadgeKey, number | string> = {
    going: typeof counts?.going === "number" ? counts.going : "—",
    interested: typeof counts?.interested === "number" ? counts.interested : "—",
    verified: typeof counts?.verified === "number" ? counts.verified : "—",
  };

  if (!sessionId) return null;

  return (
    <div className="flex flex-wrap items-center gap-xs text-xs font-semibold">
      {RELIABILITY_BADGE_ORDER.map((key) => {
        const token = RELIABILITY_BADGE_TOKENS[key];
        const value = badgeValues[key];
        return (
          <span
            key={key}
            className="inline-flex items-center gap-xxs rounded-full border px-xs py-hairline"
            style={{ backgroundColor: token.backgroundColor, borderColor: token.borderColor, color: token.textColor }}
          >
            {token.icon && (
              <span aria-hidden="true" className="text-xs">
                {token.icon}
              </span>
            )}
            {token.label}: {value}
          </span>
        );
      })}
    </div>
  );
}
