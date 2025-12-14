"use client";

import Link from "next/link";
import {
  RELIABILITY_BADGE_ORDER,
  RELIABILITY_BADGE_TOKENS,
  trackReliabilityAttendanceLogViewed,
} from "@dowhat/shared";

import type { AttendanceMetrics, Reliability } from "@/types/profile";

type Props = {
  reliability?: Reliability | null;
  attendance?: AttendanceMetrics;
};

export function ReliabilityExplainer({ reliability, attendance }: Props) {
  const score = typeof reliability?.score === "number" ? Math.round(reliability.score) : null;
  const confidencePercent =
    typeof reliability?.confidence === "number"
      ? Math.round(reliability.confidence * 100)
      : null;
  const hasReliabilityScore = score !== null;
  const total30 =
    (attendance?.attended30 || 0) +
    (attendance?.noShow30 || 0) +
    (attendance?.lateCancel30 || 0) +
    (attendance?.excused30 || 0);
  const total90 =
    (attendance?.attended90 || 0) +
    (attendance?.noShow90 || 0) +
    (attendance?.lateCancel90 || 0) +
    (attendance?.excused90 || 0);
  const attendanceRate30 = total30 ? Math.round(((attendance?.attended30 || 0) / total30) * 100) : null;
  const noShowRate90 = total90 ? Math.round(((attendance?.noShow90 || 0) / total90) * 100) : null;
  const reliabilityDescriptionCopy = hasReliabilityScore
    ? "Show up for confirmed sessions, keep last-minute changes to a minimum, and let GPS check-ins confirm you were there to keep your score high."
    : "Attend a few confirmed sessions and check in so we can calculate your reliability score.";

  return (
    <div className="rounded-2xl border border-midnight-border/40 bg-surface p-lg shadow-sm space-y-md">
      <div className="flex flex-col gap-sm">
        <div className="flex items-center justify-between gap-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-medium">Reliability index</p>
            <div className="flex items-baseline gap-xxs">
              <span className="text-3xl font-semibold text-ink-strong tabular-nums">{score ?? "—"}</span>
              <span className="text-xs text-ink-muted">score</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-medium">Confidence</p>
            <p className="text-sm font-medium text-brand-teal">
              {confidencePercent != null ? `${confidencePercent}%` : "—"}
            </p>
          </div>
        </div>
        <p className="text-sm text-ink-medium">{reliabilityDescriptionCopy}</p>
      </div>
      <div className="space-y-xs">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-medium">Badges explained</p>
        <div className="flex flex-wrap gap-xs text-xs font-medium">
          {RELIABILITY_BADGE_ORDER.map((key) => {
            const token = RELIABILITY_BADGE_TOKENS[key];
            return (
              <span
                key={key}
                className="inline-flex items-center gap-xxs rounded-full border px-sm py-hairline"
                style={{
                  backgroundColor: token.backgroundColor,
                  borderColor: token.borderColor,
                  color: token.textColor,
                }}
              >
                {token.icon && (
                  <span aria-hidden>{token.icon}</span>
                )}
                {token.label}
              </span>
            );
          })}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-md text-sm text-ink-medium">
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Attended (30d)</dt>
          <dd className="mt-xxs font-semibold text-ink-strong">
            {attendance?.attended30 ?? 0}
            {total30 ? ` / ${total30} · ${attendanceRate30}%` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">No-shows (90d)</dt>
          <dd className="mt-xxs font-semibold text-ink-strong">
            {attendance?.noShow90 ?? 0}
            {total90 ? ` · ${noShowRate90}%` : ""}
          </dd>
        </div>
      </dl>
      <div className="flex items-center justify-between gap-sm text-xs text-ink-medium">
        <span>Need to contest a result?</span>
        <Link
          href="/my/attendance"
          className="inline-flex items-center gap-xxs rounded-full border border-brand-teal px-sm py-xxs text-brand-teal transition hover:bg-brand-teal hover:text-white"
          onClick={() =>
            trackReliabilityAttendanceLogViewed({ platform: "web", surface: "profile-reliability-card" })
          }
        >
          View attendance log
        </Link>
      </div>
    </div>
  );
}
